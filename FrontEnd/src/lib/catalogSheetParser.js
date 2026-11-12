const FIELDS = {
  name: ['nombre', 'producto', 'productos', 'articulo', 'item', 'titulo', 'detalle', 'name', 'product'],
  category: ['categoria', 'categorias', 'rubro', 'seccion', 'familia', 'grupo', 'tipo', 'category'],
  description: ['descripcion', 'detalle', 'ingredientes', 'observaciones', 'description'],
  price: ['precio', 'precio venta', 'precio de venta', 'precio final', 'valor', 'importe', 'costo', 'monto', 'price', 'pvp', '$'],
  points: ['puntos por unidad', 'puntos por producto', 'puntos', 'pts', 'points'],
  rewardPoints: ['puntos necesarios', 'puntos requeridos', 'costo en puntos', 'puntos', 'pts'],
  rewardType: ['tipo de canje', 'tipo'],
  rewardProduct: ['producto asociado', 'producto'],
  rewardCategory: ['categoria del producto', 'categoria'],
  discountType: ['tipo de descuento', 'modalidad'],
  discountValue: ['valor de descuento', 'descuento', 'valor'],
}

export function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : NaN
  let text = String(value ?? '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(text)) return NaN
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ','
    text = text.replaceAll(decimal === '.' ? ',' : '.', '').replace(decimal, '.')
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? '.' : ','
    const parts = text.split(separator)
    text = parts.length > 2 || parts[1].length === 3 ? parts.join('') : `${parts[0]}.${parts[1]}`
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? Math.round(parsed) : NaN
}

function findHeaderRow(rows) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const headers = rows[index].map(normalizeText)
    if (headers.some((header) => FIELDS.name.includes(header))) return index
  }
  return -1
}

function columnFor(headers, aliases, taken = new Set()) {
  for (const alias of aliases) {
    const index = headers.findIndex((header, column) => header === alias && !taken.has(column))
    if (index >= 0) return index
  }
  for (const alias of aliases) {
    if (alias.length < 4) continue
    const index = headers.findIndex((header, column) => header.includes(alias) && !taken.has(column))
    if (index >= 0) return index
  }
  return -1
}

function cell(row, index) {
  return index >= 0 ? String(row[index] ?? '').trim() : ''
}

function classifySheet(sheetName, headers) {
  const name = normalizeText(sheetName)
  if (/canje|recompensa|premio|reward/.test(name)) return 'rewards'
  if (/categor/.test(name) && columnFor(headers, FIELDS.price) < 0) return 'categories'
  if (columnFor(headers, FIELDS.rewardPoints.slice(0, 3)) >= 0 && columnFor(headers, FIELDS.price) < 0) return 'rewards'
  return 'products'
}

export function parseWorkbook(workbook, XLSX) {
  const errors = []
  const warnings = []
  const categories = []
  const products = []
  const rewards = []
  const seenProducts = new Set()

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false })
    const headerIndex = findHeaderRow(rows)
    if (headerIndex < 0) continue
    const headers = rows[headerIndex].map(normalizeText)
    const kind = classifySheet(sheetName, headers)
    const dataRows = rows.slice(headerIndex + 1)
    const where = (index) => `${sheetName}, fila ${headerIndex + index + 2}`

    if (kind === 'categories') {
      const nameColumn = columnFor(headers, [...FIELDS.name, ...FIELDS.category])
      for (const row of dataRows) {
        const name = cell(row, nameColumn).slice(0, 60)
        if (name) categories.push(name)
      }
      continue
    }

    if (kind === 'products') {
      const taken = new Set()
      const nameColumn = columnFor(headers, FIELDS.name, taken)
      taken.add(nameColumn)
      const priceColumn = columnFor(headers, FIELDS.price, taken)
      taken.add(priceColumn)
      const categoryColumn = columnFor(headers, FIELDS.category, taken)
      taken.add(categoryColumn)
      const descriptionColumn = columnFor(headers, FIELDS.description, taken)
      taken.add(descriptionColumn)
      const pointsColumn = columnFor(headers, FIELDS.points, taken)
      dataRows.forEach((row, index) => {
        const name = cell(row, nameColumn).slice(0, 100)
        if (!name) return
        const key = `${normalizeText(name)}|${normalizeText(cell(row, categoryColumn))}`
        if (seenProducts.has(key)) return
        seenProducts.add(key)
        let price = parseNumber(cell(row, priceColumn))
        if (!Number.isSafeInteger(price) || price < 1 || price > 100_000_000) {
          warnings.push(`${where(index)}: "${name}" no tiene precio válido. Se importa con $1 para que lo edites.`)
          price = 1
        }
        const points = parseNumber(cell(row, pointsColumn))
        products.push({
          name,
          category: cell(row, categoryColumn).slice(0, 60) || 'Otros',
          description: cell(row, descriptionColumn).slice(0, 500),
          price,
          pointsPerUnit: Number.isSafeInteger(points) && points >= 0 && points <= 1_000_000 ? points : 0,
        })
      })
      continue
    }

    const taken = new Set()
    const nameColumn = columnFor(headers, FIELDS.name, taken)
    taken.add(nameColumn)
    const pointsColumn = columnFor(headers, FIELDS.rewardPoints, taken)
    taken.add(pointsColumn)
    const descriptionColumn = columnFor(headers, FIELDS.description, taken)
    taken.add(descriptionColumn)
    const typeColumn = columnFor(headers, FIELDS.rewardType, taken)
    taken.add(typeColumn)
    const productColumn = columnFor(headers, ['producto asociado'], taken)
    const categoryColumn = columnFor(headers, ['categoria del producto'], taken)
    const discountTypeColumn = columnFor(headers, FIELDS.discountType, taken)
    const discountValueColumn = columnFor(headers, FIELDS.discountValue, taken)
    dataRows.forEach((row, index) => {
      const name = cell(row, nameColumn).slice(0, 100)
      if (!name) return
      const pointsCost = parseNumber(cell(row, pointsColumn))
      if (!Number.isSafeInteger(pointsCost) || pointsCost < 1 || pointsCost > 1_000_000) {
        warnings.push(`${where(index)}: el canje "${name}" no tiene puntos necesarios y se omitió.`)
        return
      }
      const rewardType = normalizeText(cell(row, typeColumn)).startsWith('desc') ? 'discount' : 'product'
      const productName = cell(row, productColumn)
      const productCategory = cell(row, categoryColumn)
      const discountType = normalizeText(cell(row, discountTypeColumn)).startsWith('porc') ? 'percentage' : 'fixed'
      const discountValue = parseNumber(cell(row, discountValueColumn))
      if (rewardType === 'product' && (!productName || !productCategory)) {
        warnings.push(`${where(index)}: el canje "${name}" no indica producto y categoría y se omitió.`)
        return
      }
      if (rewardType === 'discount' && (!Number.isSafeInteger(discountValue) || discountValue < 1
        || (discountType === 'percentage' && discountValue > 100) || discountValue > 100_000_000)) {
        warnings.push(`${where(index)}: el canje "${name}" no tiene un valor de descuento válido y se omitió.`)
        return
      }
      rewards.push({
        name,
        description: cell(row, descriptionColumn).slice(0, 500),
        rewardType,
        productName,
        productCategory,
        discountType,
        discountValue: rewardType === 'discount' ? discountValue : 0,
        pointsCost,
      })
    })
  }

  const allCategories = [...new Map([...categories, ...products.map((product) => product.category)]
    .map((name) => [name.toLocaleLowerCase('es'), name])).values()]
  if (!products.length && !rewards.length && !allCategories.length) {
    errors.push('No encontramos productos. Asegurate de que la hoja tenga una fila de títulos con al menos una columna "Nombre" (y de ser posible "Precio" y "Categoría").')
  }
  return { preview: { categories: allCategories, products, rewards }, errors, warnings }
}
