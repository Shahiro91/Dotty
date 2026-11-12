import { readRewardInput } from '../loyalty/rewards.schema.js'
import { readProductInput } from './products.schema.js'

export function readCatalogImport(body) {
  const categoryRows = Array.isArray(body?.categories) ? body.categories : []
  const productRows = Array.isArray(body?.products) ? body.products : []
  const rewardRows = Array.isArray(body?.rewards) ? body.rewards : []
  if (categoryRows.length > 100 || productRows.length > 500 || rewardRows.length > 200
    || categoryRows.length + productRows.length + rewardRows.length === 0) {
    return { error: 'El archivo debe incluir hasta 100 categorías, 500 productos y 200 canjes.' }
  }
  const importedCategories = []
  const categoryKeys = new Set()
  for (const value of [...categoryRows, ...productRows.map((product) => product?.category)]) {
    if (typeof value !== 'string') return { error: 'Hay una categoría vacía o inválida en el archivo.' }
    const name = value.trim()
    if (!name || name.length > 60) return { error: 'Cada categoría debe tener entre 1 y 60 caracteres.' }
    const key = name.toLocaleLowerCase('es')
    if (!categoryKeys.has(key)) {
      categoryKeys.add(key)
      importedCategories.push(name)
    }
  }
  const products = productRows.map((row) => readProductInput({ ...row, imageDataUrl: '' }))
  if (products.some((product) => !product)) return { error: 'Revisá los nombres, categorías, precios y puntos de los productos del archivo.' }
  const rewards = rewardRows.map((row) => {
    const reward = readRewardInput(row)
    if (!reward) return null
    return {
      ...reward,
      productName: typeof row?.productName === 'string' ? row.productName.trim() : '',
      productCategory: typeof row?.productCategory === 'string' ? row.productCategory.trim() : '',
    }
  })
  if (rewards.some((reward) => !reward)) return { error: 'Revisá los nombres, descripciones y puntos necesarios de los canjes.' }
  return { importedCategories, categoryKeys, products, rewards }
}
