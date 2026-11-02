import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { currency } from '../data/menu.js'
import styles from './AddonGroupsManager.module.css'

const emptyGroup = { groupName: '', productId: '', selectionMode: 'single', isRequired: false, name: '', price: '' }
const emptyOption = { name: '', price: '' }

const groupKeyOf = (addon) => `${addon.productId ?? ''}:${addon.groupName.toLocaleLowerCase('es')}`
const priceLabel = (price) => (price > 0 ? `+${currency.format(price)}` : 'Sin cargo')

function AddonGroupsManager({ category, products, addons, token, enabled, isFractional, isSaving, onToggleEnabled, onAddonsChange, onError, onSuccess }) {
  const [isCreating, setIsCreating] = useState(false)
  const [groupDraft, setGroupDraft] = useState(emptyGroup)
  const [optionDrafts, setOptionDrafts] = useState({})
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingOption, setEditingOption] = useState(null)
  const [busy, setBusy] = useState(false)

  const categoryProducts = products.filter((product) => product.category === category && product.isAvailable !== false)
  const groups = addons.filter((addon) => addon.category === category).reduce((list, addon) => {
    const key = groupKeyOf(addon)
    const group = list.find((item) => item.key === key)
    if (group) group.options.push(addon)
    else list.push({ key, name: addon.groupName, productId: addon.productId, productName: addon.productName, selectionMode: addon.selectionMode, isRequired: addon.isRequired === true, requiredTwo: addon.requiredTwo === true, options: [addon] })
    return list
  }, [])

  async function run(action) {
    setBusy(true)
    onError('')
    try { await action() } catch (error) { onError(error.message) } finally { setBusy(false) }
  }

  function replaceGroup(oldIds, newAddons) {
    onAddonsChange((current) => [...current.filter((addon) => !oldIds.includes(addon.id)), ...newAddons])
  }

  const createGroup = (event) => {
    event.preventDefault()
    run(async () => {
      const result = await apiRequest('/partner/category-addons', {
        method: 'POST', token,
        body: {
          category, groupName: groupDraft.groupName.trim(), name: groupDraft.name.trim(), price: Number(groupDraft.price || 0),
          selectionMode: groupDraft.selectionMode, isRequired: groupDraft.isRequired,
          productId: isFractional || !groupDraft.productId ? null : Number(groupDraft.productId),
        },
      })
      onAddonsChange((current) => [...current, result.addon])
      setGroupDraft(emptyGroup)
      setIsCreating(false)
      onSuccess('Grupo creado. Podés seguir agregando opciones.')
    })
  }

  const addOption = (group) => {
    const draft = optionDrafts[group.key] || emptyOption
    if (!draft.name.trim()) return
    run(async () => {
      const result = await apiRequest('/partner/category-addons', {
        method: 'POST', token,
        body: { category, groupName: group.name, name: draft.name.trim(), price: Number(draft.price || 0), selectionMode: group.selectionMode, requiredTwo: group.requiredTwo, productId: group.productId },
      })
      onAddonsChange((current) => [...current, result.addon])
      setOptionDrafts((current) => ({ ...current, [group.key]: emptyOption }))
    })
  }

  const saveOption = (group, option) => run(async () => {
    const result = await apiRequest(`/partner/category-addons/${option.id}`, {
      method: 'PATCH', token,
      body: { category, groupName: group.name, name: editingOption.name.trim(), price: Number(editingOption.price || 0), selectionMode: group.selectionMode, requiredTwo: group.requiredTwo, productId: group.productId },
    })
    onAddonsChange((current) => current.map((addon) => (result.groupAddons || [result.addon]).find((updated) => updated.id === addon.id) || addon))
    setEditingOption(null)
  })

  const removeOption = (option) => run(async () => {
    await apiRequest(`/partner/category-addons/${option.id}`, { method: 'DELETE', token })
    onAddonsChange((current) => current.filter((addon) => addon.id !== option.id))
  })

  const saveGroup = (group, event) => {
    event.preventDefault()
    run(async () => {
      const result = await apiRequest('/partner/category-addon-groups', {
        method: 'PATCH', token,
        body: {
          category, groupName: group.name, productId: group.productId,
          newGroupName: editingGroup.groupName.trim(), newProductId: isFractional || !editingGroup.productId ? null : Number(editingGroup.productId),
          selectionMode: editingGroup.selectionMode, isRequired: editingGroup.isRequired, clearRequiredTwo: group.requiredTwo && editingGroup.clearRequiredTwo === true,
        },
      })
      replaceGroup(group.options.map((option) => option.id), result.groupAddons)
      setEditingGroup(null)
      onSuccess('Grupo actualizado.')
    })
  }

  const removeGroup = (group) => {
    if (!window.confirm(`¿Eliminar el grupo "${group.name}" con sus ${group.options.length} opciones?`)) return
    run(async () => {
      await apiRequest('/partner/category-addon-groups', { method: 'DELETE', token, body: { category, groupName: group.name, productId: group.productId } })
      replaceGroup(group.options.map((option) => option.id), [])
      onSuccess('Grupo eliminado.')
    })
  }

  function startEditingGroup(group) {
    setEditingGroup({ key: group.key, groupName: group.name, productId: group.productId ? String(group.productId) : '', selectionMode: group.selectionMode, isRequired: group.isRequired, clearRequiredTwo: false })
  }

  function groupSettings(draft, setDraft, lockedMode, idPrefix) {
    return <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-name`}>Nombre del grupo (lo ve el cliente)</label>
        <input id={`${idPrefix}-name`} maxLength={80} placeholder="Ej: Tamaño, Cocción, Extras" value={draft.groupName} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} required />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-mode`}>El cliente puede elegir</label>
        <select id={`${idPrefix}-mode`} value={draft.selectionMode} disabled={lockedMode} onChange={(event) => setDraft({ ...draft, selectionMode: event.target.value })}>
          <option value="single">Una sola opción (ej. tamaño, cocción)</option>
          <option value="multiple">Una o varias (ej. extras)</option>
        </select>
      </div>
      {!isFractional && <div className={styles.field}>
        <label htmlFor={`${idPrefix}-scope`}>Se aplica a</label>
        <select id={`${idPrefix}-scope`} value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value })}>
          <option value="">Todos los productos de “{category}”</option>
          {categoryProducts.map((product) => <option key={product.id} value={product.id}>Solo {product.name}</option>)}
        </select>
      </div>}
      <label className={styles.check}>
        <input type="checkbox" checked={draft.isRequired} onChange={(event) => setDraft({ ...draft, isRequired: event.target.checked })} />
        <span>El cliente <strong>debe elegir</strong> una opción de este grupo para poder agregar el producto</span>
      </label>
    </>
  }

  return <section className={styles.manager}>
    <header className={styles.header}>
      <div>
        <h2>Opciones para elegir en {category}</h2>
        <p>Cosas que el cliente elige sobre su pedido: tamaño, cocción, extras. Cada opción puede sumar un importe o no costar nada.</p>
      </div>
      <label className={styles.switchRow}>
        <span>{enabled ? 'Activadas' : 'Desactivadas'}</span>
        <input className={styles.switchInput} type="checkbox" checked={enabled} disabled={isSaving} onChange={(event) => onToggleEnabled(event.target.checked)} aria-label="Activar opciones para elegir" />
        <span className={styles.switchTrack} />
      </label>
    </header>
    {isFractional && <p className={styles.hint}>Esta categoría se vende combinando gustos: las opciones se eligen una sola vez para todo el producto armado (ej. tamaño de la pizza entera).</p>}

    {groups.length === 0 && !isCreating && <p className={styles.empty}>Todavía no hay grupos de opciones. Si no los necesitás, dejá esto así: tus clientes agregan el producto directo.</p>}

    <div className={styles.groups}>
      {groups.map((group) => {
        const draft = optionDrafts[group.key] || emptyOption
        const isEditingGroup = editingGroup?.key === group.key
        return <article className={styles.group} key={group.key}>
          {isEditingGroup
            ? <form className={styles.groupForm} onSubmit={(event) => saveGroup(group, event)}>
              {groupSettings(editingGroup, setEditingGroup, group.requiredTwo && !editingGroup.clearRequiredTwo, 'edit-addon-group')}
              {group.requiredTwo && <label className={styles.check}><input type="checkbox" checked={editingGroup.clearRequiredTwo} onChange={(event) => setEditingGroup({ ...editingGroup, clearRequiredTwo: event.target.checked })} /><span>Quitar la regla anterior de “exactamente 2 opciones”</span></label>}
              <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy}>Guardar grupo</button><button className={styles.link} type="button" onClick={() => setEditingGroup(null)}>Cancelar</button></div>
            </form>
            : <header className={styles.groupHeader}>
              <div>
                <strong>{group.name}</strong>
                <span>
                  {group.selectionMode === 'single' ? 'Elige una' : 'Elige varias'}
                  {group.isRequired ? ' · Obligatorio' : ' · Opcional'}
                  {group.requiredTwo ? ' · Exige 2 (regla anterior)' : ''}
                  {` · ${group.productId ? `Solo ${group.productName || 'un producto'}` : 'Toda la categoría'}`}
                </span>
              </div>
              <button className={styles.iconButton} type="button" title="Editar grupo" aria-label={`Editar grupo ${group.name}`} onClick={() => startEditingGroup(group)}><Pencil size={15} /></button>
              <button className={styles.iconButton} type="button" title="Eliminar grupo" aria-label={`Eliminar grupo ${group.name}`} disabled={busy} onClick={() => removeGroup(group)}><Trash2 size={15} /></button>
            </header>}
          <ul className={styles.options}>
            {group.options.map((option) => <li key={option.id}>
              {editingOption?.id === option.id
                ? <form className={styles.optionRow} onSubmit={(event) => { event.preventDefault(); saveOption(group, option) }}>
                  <input aria-label="Nombre de la opción" maxLength={80} value={editingOption.name} onChange={(event) => setEditingOption({ ...editingOption, name: event.target.value })} required />
                  <input aria-label="Precio extra" type="number" min="0" step="1" placeholder="Sin cargo" value={editingOption.price} onChange={(event) => setEditingOption({ ...editingOption, price: event.target.value })} />
                  <button className={styles.primary} type="submit" disabled={busy}>Guardar</button>
                  <button className={styles.iconButton} type="button" aria-label="Cancelar" onClick={() => setEditingOption(null)}><X size={15} /></button>
                </form>
                : <div className={styles.optionRow}>
                  <span className={styles.optionName}>{option.name}</span>
                  <span className={option.price > 0 ? styles.optionPrice : styles.optionFree}>{priceLabel(option.price)}</span>
                  <button className={styles.iconButton} type="button" aria-label={`Editar ${option.name}`} onClick={() => setEditingOption({ id: option.id, name: option.name, price: option.price ? String(option.price) : '' })}><Pencil size={14} /></button>
                  <button className={styles.iconButton} type="button" aria-label={`Quitar ${option.name}`} disabled={busy} onClick={() => removeOption(option)}><Trash2 size={14} /></button>
                </div>}
            </li>)}
          </ul>
          <form className={styles.optionRow} onSubmit={(event) => { event.preventDefault(); addOption(group) }}>
            <input aria-label={`Nueva opción para ${group.name}`} maxLength={80} placeholder="Nueva opción (ej. Grande)" value={draft.name} onChange={(event) => setOptionDrafts({ ...optionDrafts, [group.key]: { ...draft, name: event.target.value } })} />
            <input aria-label="Precio extra" type="number" min="0" max="100000000" step="1" placeholder="Precio extra (opcional)" value={draft.price} onChange={(event) => setOptionDrafts({ ...optionDrafts, [group.key]: { ...draft, price: event.target.value } })} />
            <button className={styles.secondary} type="submit" disabled={busy || !draft.name.trim()}><Plus size={14} /> Agregar</button>
          </form>
        </article>
      })}
    </div>

    {isCreating
      ? <form className={styles.newGroup} onSubmit={createGroup}>
        <h3>Nuevo grupo de opciones</h3>
        {groupSettings(groupDraft, setGroupDraft, false, 'new-addon-group')}
        <div className={styles.field}>
          <label htmlFor="addon-first-option">Primera opción</label>
          <input id="addon-first-option" maxLength={80} placeholder="Ej: Chica" value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="addon-first-price">Precio extra (opcional)</label>
          <input id="addon-first-price" type="number" min="0" max="100000000" step="1" placeholder="Sin cargo" value={groupDraft.price} onChange={(event) => setGroupDraft({ ...groupDraft, price: event.target.value })} />
        </div>
        <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy}>Crear grupo</button><button className={styles.link} type="button" onClick={() => { setIsCreating(false); setGroupDraft(emptyGroup) }}>Cancelar</button></div>
      </form>
      : <button className={styles.secondary} type="button" onClick={() => setIsCreating(true)}><Plus size={14} /> Nuevo grupo de opciones</button>}
  </section>
}

export default AddonGroupsManager
