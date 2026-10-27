import { useState } from 'react'
import { AlertCircle, Check, Download, FileSpreadsheet, LoaderCircle, Upload, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import styles from './CatalogImport.module.css'

function normalizeHeader(value) {
  return String(value ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function readSheet(workbook, sheetName, XLSX) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  const [headerRow = [], ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  const headers = headerRow.map(normalizeHeader)
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
  })).filter(({ values }) => Object.values(values).some((value) => String(value).trim() !== ''))
}

function parseInteger(value, { optional = false } = {}) {
  if (optional && (value === '' || value === null || value === undefined)) return 0
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : NaN
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!normalized) return optional ? 0 : NaN
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : NaN
}

function firstValue(values, headers) {
  for (const header of headers) {
    const value = values[header]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

async function makeTemplate() {
  const XLSX = await import('@e965/xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Nombre'], ['']]), 'Categorías')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Categoría', 'Descripción', 'Precio', 'Puntos por unidad'],
    ['', '', '', '', 0],
  ]), 'Productos')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Descripción', 'Tipo de canje', 'Producto asociado', 'Categoría del producto', 'Tipo de descuento', 'Valor de descuento', 'Puntos necesarios'],
    ['', '', 'producto', '', '', 'fijo', '', ''],
  ]), 'Canjes')
  XLSX.writeFile(workbook, 'plantilla-catalogo-dotty.xlsx')
}

function parseWorkbook(workbook, XLSX) {
  const errors = []
  const categories = []
  const products = []
  const rewards = []

  for (const row of readSheet(workbook, 'Categorías', XLSX)) {
    const name = String(firstValue(row.values, ['nombre', 'categoria'])).trim()
    if (!name || name.length > 60) errors.push(`Categorías, fila ${row.rowNumber}: completá un nombre de hasta 60 caracteres.`)
    else categories.push(name)
  }

  for (const row of readSheet(workbook, 'Productos', XLSX)) {
    const name = String(firstValue(row.values, ['nombre', 'producto'])).trim()
    const category = String(firstValue(row.values, ['categoria', 'categoria del producto'])).trim() || 'Otros'
    const description = String(firstValue(row.values, ['descripcion'])).trim()
    const price = parseInteger(firstValue(row.values, ['precio', 'price']))
    const pointsPerUnit = parseInteger(firstValue(row.values, ['puntos por unidad', 'puntos por producto', 'puntos']), { optional: true })
    if (!name && !price) continue
    if (!name || name.length > 100) errors.push(`Productos, fila ${row.rowNumber}: completá un nombre de hasta 100 caracteres.`)
    else if (!category || category.length > 60) errors.push(`Productos, fila ${row.rowNumber}: indicá una categoría de hasta 60 caracteres.`)
    else if (description.length > 500) errors.push(`Productos, fila ${row.rowNumber}: la descripción supera los 500 caracteres.`)
    else if (!Number.isSafeInteger(price) || price < 1 || price > 100_000_000) errors.push(`Productos, fila ${row.rowNumber}: el precio debe ser un entero positivo.`)
    else if (!Number.isSafeInteger(pointsPerUnit) || pointsPerUnit < 0 || pointsPerUnit > 1_000_000) errors.push(`Productos, fila ${row.rowNumber}: los puntos deben ser un entero igual o mayor a cero.`)
    else products.push({ name, category, description, price, pointsPerUnit })
  }

  for (const row of readSheet(workbook, 'Canjes', XLSX)) {
    const name = String(firstValue(row.values, ['nombre', 'canje', 'recompensa'])).trim()
    const description = String(firstValue(row.values, ['descripcion'])).trim()
    const pointsCost = parseInteger(firstValue(row.values, ['puntos necesarios', 'puntos requeridos', 'costo en puntos', 'puntos']))
    const rawRewardType = normalizeHeader(firstValue(row.values, ['tipo de canje', 'tipo']))
    const rewardType = !rawRewardType || rawRewardType === 'producto' ? 'product' : rawRewardType === 'descuento' ? 'discount' : rawRewardType
    const productName = String(firstValue(row.values, ['producto asociado', 'producto'])).trim()
    const productCategory = String(firstValue(row.values, ['categoria del producto', 'categoria'])).trim()
    const rawDiscountType = normalizeHeader(firstValue(row.values, ['tipo de descuento']))
    const discountType = !rawDiscountType || rawDiscountType === 'fijo' ? 'fixed' : rawDiscountType === 'porcentaje' ? 'percentage' : rawDiscountType
    const discountValue = parseInteger(firstValue(row.values, ['valor de descuento', 'descuento']), { optional: true })
    if (!name && !pointsCost) continue
    if (!name || name.length > 100) errors.push(`Canjes, fila ${row.rowNumber}: completá un nombre de hasta 100 caracteres.`)
    else if (description.length > 500) errors.push(`Canjes, fila ${row.rowNumber}: la descripción supera los 500 caracteres.`)
    else if (!Number.isSafeInteger(pointsCost) || pointsCost < 1 || pointsCost > 1_000_000) errors.push(`Canjes, fila ${row.rowNumber}: los puntos necesarios deben ser un entero positivo.`)
    else if (!['product', 'discount'].includes(rewardType)) errors.push(`Canjes, fila ${row.rowNumber}: el tipo debe ser producto o descuento.`)
    else if (rewardType === 'product' && (!productName || !productCategory)) errors.push(`Canjes, fila ${row.rowNumber}: indicá el producto asociado y su categoría.`)
    else if (!['fixed', 'percentage'].includes(discountType)) errors.push(`Canjes, fila ${row.rowNumber}: el descuento debe ser fijo o porcentaje.`)
    else if (rewardType === 'discount' && (!Number.isSafeInteger(discountValue) || discountValue < 1 || (discountType === 'percentage' && discountValue > 100) || (discountType === 'fixed' && discountValue > 100_000_000))) errors.push(`Canjes, fila ${row.rowNumber}: completá un valor de descuento válido.`)
    else rewards.push({ name, description, rewardType, productName, productCategory, discountType, discountValue, pointsCost })
  }

  const allCategories = [...new Map([...categories, ...products.map((product) => product.category)]
    .map((name) => [name.toLocaleLowerCase('es'), name])).values()]
  if (!products.length && !rewards.length && !allCategories.length) errors.push('El archivo no contiene filas para importar.')
  return { preview: { categories: allCategories, products, rewards }, errors }
}

function CatalogImport({ token, plan, onImported }) {
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [fileName, setFileName] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState('')

  async function selectWorkbook(event) {
    const [file] = event.target.files || []
    event.target.value = ''
    if (!file) return
    setPreview(null)
    setErrors([])
    setMessage('')
    setFileName(file.name)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(['El archivo supera el límite de 5 MB.'])
      return
    }
    setIsReading(true)
    try {
      const XLSX = await import('@e965/xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const result = parseWorkbook(workbook, XLSX)
      setPreview(result.preview)
      setErrors(result.errors)
    } catch {
      setErrors(['No se pudo leer el archivo. Usá la plantilla XLSX descargable.'])
    } finally {
      setIsReading(false)
    }
  }

  async function importCatalog() {
    if (!preview || errors.length || !plan || plan !== 'vip') return
    setIsImporting(true)
    setMessage('')
    try {
      const result = await apiRequest('/partner/import-catalog', { method: 'POST', token, body: preview })
      await onImported()
      setMessage(`Importación lista: ${result.categoriesCreated} categorías nuevas, ${result.productsCreated} productos nuevos y ${result.productsUpdated} actualizados, ${result.rewardsCreated} canjes nuevos y ${result.rewardsUpdated} actualizados.`)
      setPreview(null)
      setErrors([])
      setFileName('')
    } catch (importError) {
      setErrors([importError.message])
    } finally {
      setIsImporting(false)
    }
  }

  if (plan !== 'vip') return <section className={styles.locked}>
    <div className={styles.lockContent}>
      <span className={styles.lockIcon}><FileSpreadsheet size={23} /></span>
      <span className={styles.vip}>Exclusivo VIP</span>
      <h2>Importar catálogo</h2>
      <p>Cargá categorías, productos y canjes desde un archivo Excel. Esta función está disponible con el Plan VIP.</p>
      <button className={styles.lockedAction} type="button" disabled>Disponible con Plan VIP</button>
    </div>
  </section>

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>PLAN VIP</span><h2>Importar catálogo</h2><p>Cargá categorías, productos y canjes desde un archivo de Excel.</p></div>
      <button className={styles.templateButton} type="button" onClick={makeTemplate}><Download size={15} /> Descargar plantilla</button>
    </header>
    <div className={styles.instructions}>
      <strong>Formato del archivo</strong>
      <span>Usá las hojas Categorías, Productos y Canjes. Las categorías de los productos también se agregan automáticamente.</span>
      <span>Si ya existe un producto o canje con el mismo nombre, se actualizarán sus datos en lugar de duplicarlo.</span>
    </div>
    <label className={styles.filePicker}>
      <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={selectWorkbook} />
      {isReading ? <LoaderCircle size={20} className={styles.spinner} /> : <Upload size={20} />}
      <span><strong>{isReading ? 'Leyendo archivo...' : fileName || 'Elegir archivo Excel'}</strong><small>Formato .xlsx o .xls · Máximo 5 MB</small></span>
    </label>

    {message && <p className={styles.success} role="status"><Check size={16} /> {message}</p>}
    {errors.length > 0 && <div className={styles.errorList} role="alert"><strong><AlertCircle size={15} /> Corregí estos datos antes de importar</strong>{errors.slice(0, 8).map((error) => <span key={error}>{error}</span>)}{errors.length > 8 && <small>Y {errors.length - 8} errores más.</small>}</div>}

    {preview && <section className={styles.preview}>
      <header className={styles.previewHeader}><div><h3>Vista previa</h3><p>{preview.categories.length} categorías · {preview.products.length} productos · {preview.rewards.length} canjes</p></div></header>
      {preview.products.length > 0 && <ImportPreviewTable title="Productos" rows={preview.products.slice(0, 5)} columns={['name', 'category', 'price', 'pointsPerUnit']} />}
      {preview.categories.length > 0 && <p className={styles.categoryPreview}>Categorías: {preview.categories.join(', ')}</p>}
      {preview.rewards.length > 0 && <ImportPreviewTable title="Canjes" rows={preview.rewards.slice(0, 5)} columns={['name', 'rewardType', 'productName', 'productCategory', 'discountType', 'discountValue', 'pointsCost']} />}
      {errors.length === 0 && <button className={styles.importButton} type="button" onClick={importCatalog} disabled={isImporting || isReading}>
        {isImporting ? <LoaderCircle size={16} className={styles.spinner} /> : <Upload size={16} />}{isImporting ? 'Importando...' : 'Confirmar importación'}
      </button>}
    </section>}
  </section>
}

function ImportPreviewTable({ title, rows, columns }) {
  const labels = { name: 'Nombre', category: 'Categoría', price: 'Precio', pointsPerUnit: 'Puntos/u', pointsCost: 'Puntos', rewardType: 'Tipo', productName: 'Producto', productCategory: 'Categoría', discountType: 'Modalidad', discountValue: 'Descuento' }
  return <div className={styles.tableSection}><h4>{title}</h4><div className={styles.tableWrap}><table><thead><tr>{columns.map((column) => <th key={column}>{labels[column]}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.name}-${index}`}>{columns.map((column) => <td key={column}>{column === 'price' || column === 'discountValue' ? Number(row[column]).toLocaleString('es-AR') : column === 'rewardType' ? row[column] === 'discount' ? 'Descuento' : 'Producto' : column === 'discountType' ? row[column] === 'percentage' ? '%' : 'Monto' : row[column]}</td>)}</tr>)}</tbody></table></div></div>
}

export default CatalogImport
