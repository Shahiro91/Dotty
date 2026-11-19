import { pool } from '../../database/pool.js'
import { findAvailableProduct, insertCategory, listCategoryNames, saveProduct, saveReward } from './import.repository.js'

export async function importCatalog(businessId, input) {
  const client = await pool.connect()
  let started = false
  try {
    await client.query('BEGIN')
    started = true
    const currentCategories = await listCategoryNames(client, businessId)
    const availableCategories = new Set([...currentCategories.map((name) => name.toLocaleLowerCase('es')), ...input.categoryKeys])
    if (input.products.some((product) => !availableCategories.has(product.category.toLocaleLowerCase('es')))) {
      await client.query('ROLLBACK')
      started = false
      return { error: 'Cada producto debe pertenecer a una categoría existente o incluida en el archivo.' }
    }
    const counts = { categoriesCreated: 0, productsCreated: 0, productsUpdated: 0, rewardsCreated: 0, rewardsUpdated: 0 }
    let hasNewRewards = false
    for (const name of input.importedCategories) counts.categoriesCreated += await insertCategory(client, businessId, name)
    for (const product of input.products) {
      if (await saveProduct(client, businessId, product)) counts.productsCreated += 1
      else counts.productsUpdated += 1
    }
    for (const reward of input.rewards) {
      let productId = reward.productId
      if (reward.rewardType === 'product') {
        const product = await findAvailableProduct(client, businessId, reward.productName, reward.productCategory)
        if (!reward.productName || !reward.productCategory || !product) {
          await client.query('ROLLBACK')
          started = false
          return { error: `El producto asociado al canje "${reward.name}" no existe en esa categoría.` }
        }
        productId = product.id
      }
      const saved = await saveReward(client, businessId, reward, productId)
      if (saved.created) counts.rewardsCreated += 1
      else counts.rewardsUpdated += 1
      hasNewRewards ||= saved.newlyAvailable
    }
    await client.query('COMMIT')
    started = false
    return { counts, hasNewRewards }
  } catch (error) {
    if (started) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
