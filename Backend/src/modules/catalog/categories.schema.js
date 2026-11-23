function validName(name) {
  return Boolean(name) && name.length <= 60
}

function validParts(parts) {
  return Number.isInteger(parts) && (parts === 0 || (parts >= 2 && parts <= 12))
}

export function readCreateCategory(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const fractionalParts = body?.fractionalParts == null ? 0 : Number(body.fractionalParts)
  return validName(name) && validParts(fractionalParts) ? { name, fractionalParts } : null
}

export function readUpdateCategory(body) {
  const currentName = typeof body?.currentName === 'string' ? body.currentName.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const fractionalParts = body?.fractionalParts == null ? null : Number(body.fractionalParts)
  return validName(currentName) && validName(name) && (fractionalParts === null || validParts(fractionalParts))
    ? { currentName, name, fractionalParts }
    : null
}

export function readDeleteCategory(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  return validName(name) ? name : null
}

export function readCategoryOrder(body) {
  const names = body?.categories
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string' || name !== name.trim() || !validName(name))
    || new Set(names).size !== names.length) return null
  return names
}
