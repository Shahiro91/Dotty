import { pool } from '../../database/pool.js'
import {
  availableProductInCategory, countGroup, disableAddon, disableGroup, findAddonForDeletion, findAddonGroup,
  findCategory, findCurrentAddon, groupExists, hasConflictingGroup, insertAddon, isAvailableProduct,
  listGroup, lockCategory, lockGroup, productInCategory, setGroupRequiredTwo, updateAddon, updateGroup,
} from './addons.repository.js'

export async function createAddon(businessId, input, requestedRequired) {
  const category = await findCategory(businessId, input.categoryName)
  if (!category) return { error: 'category_not_found' }
  if (input.productId !== null && !await isAvailableProduct(businessId, input.productId, input.categoryName)) {
    return { error: 'product_unavailable' }
  }
  const group = await findAddonGroup(category.id, input.groupName, input.productId)
  if (group && (group.selection_mode !== input.selectionMode || group.required_two !== input.requiredTwo)) {
    return { error: 'group_mismatch' }
  }
  const isRequired = group ? group.is_required : requestedRequired === true
  const addon = await insertAddon(businessId, category.id, input, isRequired)
  return { addon: { ...addon, category: input.categoryName } }
}

export async function editAddon(businessId, addonId, input) {
  const current = await findCurrentAddon(businessId, addonId)
  if (!current) return { error: 'not_found' }
  const sameGroup = String(current.productId || '') === String(input.productId || '')
    && current.groupName.toLocaleLowerCase('es') === input.groupName.toLocaleLowerCase('es')
  if (current.requiredTwo && !sameGroup) return { error: 'required_two' }
  if (input.productId !== null && !await productInCategory(businessId, input.productId, current.categoryId)) return { error: 'product' }
  if (await hasConflictingGroup(current.categoryId, addonId, input, sameGroup)) return { error: 'group_mismatch' }
  const updated = await updateAddon(businessId, addonId, input)
  if (!updated) return { error: 'not_found' }
  await setGroupRequiredTwo(businessId, current.categoryId, input)
  const groupAddons = await listGroup(pool, businessId, current.categoryId, input.productId, input.groupName)
  return { addon: groupAddons.find((addon) => addon.id === updated.id) || { ...updated, category: '' }, groupAddons }
}

export async function editAddonGroup(businessId, categoryName, current, next, selectionMode, isRequired, clearRequiredTwo) {
  const client = await pool.connect()
  let started = false
  try {
    await client.query('BEGIN')
    started = true
    const category = await lockCategory(client, businessId, categoryName)
    if (!category) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'category_not_found' }
    }
    const members = await lockGroup(client, businessId, category.id, current)
    if (!members.length) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'group_not_found' }
    }
    const keepsRequiredTwo = members[0].requiredTwo && !clearRequiredTwo
    const moved = String(current.productId ?? '') !== String(next.productId ?? '') || current.groupName.toLocaleLowerCase('es') !== next.groupName.toLocaleLowerCase('es')
    if (keepsRequiredTwo && (selectionMode !== 'multiple' || moved)) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'required_two' }
    }
    if (moved && await groupExists(client, businessId, category.id, next)) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'group_exists' }
    }
    if (next.productId !== null && !await availableProductInCategory(client, businessId, next.productId, categoryName)) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'product' }
    }
    await updateGroup(client, businessId, category.id, current, next, selectionMode, isRequired, clearRequiredTwo)
    const groupAddons = await listGroup(client, businessId, category.id, next.productId, next.groupName, true)
    await client.query('COMMIT')
    started = false
    return { groupAddons }
  } catch (error) {
    if (started) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function removeAddonGroup(businessId, categoryName, key) {
  await disableGroup(businessId, categoryName, key)
}

export async function removeAddon(businessId, addonId) {
  const addon = await findAddonForDeletion(businessId, addonId)
  if (!addon) return 'not_found'
  if (addon.requiredTwo && await countGroup(businessId, addon) <= 2) return 'required_two'
  await disableAddon(businessId, addonId)
  return 'deleted'
}
