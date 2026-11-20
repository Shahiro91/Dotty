import { useState } from 'react'
import { AlertCircle, Check, Download, FileSpreadsheet, LoaderCircle, Upload, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import styles from './CatalogImport.module.css'

import { parseWorkbook } from '../lib/catalogSheetParser.js'

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

function CatalogImport({ token, plan, onImported }) {
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])
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
    setWarnings([])
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
      setWarnings(result.warnings)
    } catch {
      setErrors(['No se pudo leer el archivo. Probá con un Excel (.xlsx, .xls) o CSV.'])
    } finally {
      setIsReading(false)
    }
  }

  async function importCatalog() {
    if (!preview || errors.length || !['vip', 'vip_plus'].includes(plan)) return
    setIsImporting(true)
    setMessage('')
    try {
      const result = await apiRequest('/partner/import-catalog', { method: 'POST', token, body: preview })
      await onImported()
      setMessage(`Importación lista: ${result.categoriesCreated} categorías nuevas, ${result.productsCreated} productos nuevos y ${result.productsUpdated} actualizados, ${result.rewardsCreated} canjes nuevos y ${result.rewardsUpdated} actualizados.`)
      setPreview(null)
      setErrors([])
      setWarnings([])
      setFileName('')
    } catch (importError) {
      setErrors([importError.message])
    } finally {
      setIsImporting(false)
    }
  }

  if (!['vip', 'vip_plus'].includes(plan)) return <section className={styles.locked}>
    <div className={styles.lockContent}>
      <span className={styles.lockIcon}><FileSpreadsheet size={23} /></span>
      <span className={styles.vip}>Exclusivo VIP</span>
      <h2>Importar catálogo</h2>
      <p>Cargá categorías, productos y canjes desde un archivo Excel. Esta función está disponible con los planes VIP y VIP PLUS.</p>
      <button className={styles.lockedAction} type="button" disabled>Disponible con Plan VIP o VIP PLUS</button>
    </div>
  </section>

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>PLAN VIP</span><h2>Importar catálogo</h2><p>Cargá categorías, productos y canjes desde un archivo de Excel.</p></div>
      <button className={styles.templateButton} type="button" onClick={makeTemplate}><Download size={15} /> Descargar plantilla</button>
    </header>
    <div className={styles.instructions}>
      <strong>Formato del archivo</strong>
      <span>Sirve cualquier planilla (Excel o CSV) con una fila de títulos y una columna "Nombre". Detectamos solas las columnas de precio, categoría, descripción y puntos.</span>
      <span>Lo que falte se completa con valores por defecto (categoría "Otros", 0 puntos) y lo podés editar después. Las hojas llamadas "Canjes" se leen como canjes.</span>
      <span>Si ya existe un producto o canje con el mismo nombre, se actualizarán sus datos en lugar de duplicarlo.</span>
    </div>
    <label className={styles.filePicker}>
      <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={selectWorkbook} />
      {isReading ? <LoaderCircle size={20} className={styles.spinner} /> : <Upload size={20} />}
      <span><strong>{isReading ? 'Leyendo archivo...' : fileName || 'Elegir archivo Excel'}</strong><small>Formato .xlsx, .xls o .csv · Máximo 5 MB</small></span>
    </label>

    {message && <p className={styles.success} role="status"><Check size={16} /> {message}</p>}
    {errors.length > 0 && <div className={styles.errorList} role="alert"><strong><AlertCircle size={15} /> Corregí estos datos antes de importar</strong>{errors.slice(0, 8).map((error) => <span key={error}>{error}</span>)}{errors.length > 8 && <small>Y {errors.length - 8} errores más.</small>}</div>}

    {warnings.length > 0 && <div className={styles.errorList} role="status"><strong><AlertCircle size={15} /> Revisá estos datos después de importar</strong>{warnings.slice(0, 8).map((warning) => <span key={warning}>{warning}</span>)}{warnings.length > 8 && <small>Y {warnings.length - 8} avisos más.</small>}</div>}

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
