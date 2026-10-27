import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowUpRight, BarChart3, Check, ChevronDown, ChevronRight, CircleDollarSign, Copy, CreditCard, Eye, FileSpreadsheet, FolderOpen, History, ImagePlus, LoaderCircle, LogOut, Package, Pencil, Plus, Printer, RefreshCw, Save, Sparkles, Store, Trash2, Users, UserPlus, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { apiRequest } from '../lib/api.js'
import { businessFontOptions, getBusinessFontVariables } from '../lib/businessStyle.js'
import { optimizeImageFile } from '../lib/image.js'
import { currency } from '../data/menu.js'
import CatalogImport from './CatalogImport.jsx'
import LocalStorefront from './LocalStorefront.jsx'
import styles from './PartnerDashboard.module.css'

const sections = [
  { id: 'store', label: 'Mi local', icon: Store },
  { id: 'products', label: 'Productos', icon: CircleDollarSign },
  { id: 'rewards', label: 'Canjes', icon: Check },
  { id: 'preview', label: 'Vista cliente', icon: Eye },
  { id: 'orders', label: 'Pedidos', icon: Package },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
  { id: 'bonus-points', label: 'Puntos dobles', icon: Sparkles },
  { id: 'referrals', label: 'Invitar amigos', icon: UserPlus },
  { id: 'catalog-import', label: 'Importar catálogo', icon: FileSpreadsheet },
  { id: 'billing', label: 'Suscripción', icon: CreditCard },
]

const weekDays = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

const orderStatuses = [
  { id: 'in_process', label: 'En proceso' },
  { id: 'sent', label: 'Enviado' },
  { id: 'cancelled', label: 'Cancelado' },
]

const emptyProduct = { name: '', description: '', category: '', price: '', pointsPerUnit: '0', imageDataUrl: '', imageScale: 1, imagePositionX: 50, imagePositionY: 50 }
const emptyReward = { name: '', description: '', imageDataUrl: '', rewardType: 'product', discountType: 'fixed', discountValue: '', pointsCost: '' }

function cropProductImage(imageDataUrl, imageScale, imagePositionX, imagePositionY) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const baseSize = Math.min(image.naturalWidth, image.naturalHeight)
      const cropSize = baseSize / imageScale
      const sourceX = (image.naturalWidth - baseSize) * imagePositionX / 100 + (baseSize - cropSize) / 2
      const sourceY = (image.naturalHeight - baseSize) * imagePositionY / 100 + (baseSize - cropSize) / 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(cropSize))
      canvas.height = Math.max(1, Math.round(cropSize))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('No se pudo procesar el recorte de la foto.'))
        return
      }
      context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/webp', 0.88))
    }
    image.onerror = () => reject(new Error('No se pudo cargar la foto para recortarla.'))
    image.src = imageDataUrl
  })
}

function PartnerDashboard({ token, user, onSignOut }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [section, setSection] = useState('orders')
  const [business, setBusiness] = useState(null)
  const [categories, setCategories] = useState([])
  const [categoryAddons, setCategoryAddons] = useState([])
  const [addonDraft, setAddonDraft] = useState({ name: '', price: '' })
  const [editingAddonId, setEditingAddonId] = useState(null)
  const [products, setProducts] = useState([])
  const [rewards, setRewards] = useState([])
  const [orders, setOrders] = useState([])
  const [billing, setBilling] = useState(null)
  const [shiftStartedAt, setShiftStartedAt] = useState(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isStartingShift, setIsStartingShift] = useState(false)
  const [statistics, setStatistics] = useState(null)
  const [statisticsLoading, setStatisticsLoading] = useState(true)
  const [statisticsError, setStatisticsError] = useState('')
  const [customers, setCustomers] = useState([])
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [cropImageRatio, setCropImageRatio] = useState(1)
  const [rewardDraft, setRewardDraft] = useState(emptyReward)
  const [editingProductId, setEditingProductId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [editingRewardId, setEditingRewardId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [busyCategory, setBusyCategory] = useState(null)
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const cropDragRef = useRef(null)

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError('')
    apiRequest('/partner/overview', { token })
      .then(async (overviewResult) => {
        if (!isCurrent) return
        setBusiness(overviewResult.business)
        setBilling(overviewResult.billing)
        if (overviewResult.billing.status === 'suspended') {
          setSection('billing')
          return
        }
        const [categoryResult, categoryAddonResult, productResult, rewardResult, orderResult, customerResult] = await Promise.all([
          apiRequest('/partner/categories', { token }),
          apiRequest('/partner/category-addons', { token }),
          apiRequest('/partner/products', { token }),
          apiRequest('/partner/rewards', { token }),
          apiRequest('/partner/orders', { token }),
          apiRequest('/partner/customers', { token }),
        ])
        if (!isCurrent) return
        setCategories(categoryResult.categories)
        setCategoryAddons(categoryAddonResult.addons)
        setProducts(productResult.products)
        setRewards(rewardResult.rewards)
        setOrders(orderResult.orders)
        setShiftStartedAt(orderResult.shiftStartedAt)
        setCustomers(customerResult.customers)
      })
      .catch((requestError) => { if (isCurrent) setError(requestError.message) })
      .finally(() => { if (isCurrent) setIsLoading(false) })
    return () => { isCurrent = false }
  }, [token])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') !== 'return') return
    const paymentId = params.get('payment_id') || params.get('collection_id')
    window.history.replaceState(null, '', window.location.pathname)
    setSection('billing')
    if (!paymentId || paymentId === 'null') return
    apiRequest('/partner/billing/confirm', { method: 'POST', token, body: { paymentId } })
      .then((result) => {
        setBilling(result.billing)
        flash(result.applied ? '¡Pago recibido! Tu suscripción fue renovada.' : result.paymentStatus === 'approved' ? 'Este pago ya estaba registrado.' : 'Todavía no vemos el pago aprobado. Si ya pagaste, se va a acreditar en unos minutos.')
      })
      .catch((confirmError) => setError(confirmError.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    let isCurrent = true
    apiRequest('/partner/stats', { token })
      .then((result) => { if (isCurrent) { setStatistics(result); setStatisticsError('') } })
      .catch((requestError) => { if (isCurrent) setStatisticsError(requestError.message) })
      .finally(() => { if (isCurrent) setStatisticsLoading(false) })
    return () => { isCurrent = false }
  }, [token])

  async function refreshStatistics() {
    setStatisticsLoading(true)
    setStatisticsError('')
    try {
      setStatistics(await apiRequest('/partner/stats', { token }))
    } catch (requestError) {
      setStatisticsError(requestError.message)
    } finally {
      setStatisticsLoading(false)
    }
  }

  async function refreshImportedCatalog() {
    const [categoryResult, productResult, rewardResult] = await Promise.all([
      apiRequest('/partner/categories', { token }),
      apiRequest('/partner/products', { token }),
      apiRequest('/partner/rewards', { token }),
    ])
    setCategories(categoryResult.categories)
    setProducts(productResult.products)
    setRewards(rewardResult.rewards)
  }

  function flash(text) {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2800)
  }

  const safeCropRatio = cropImageRatio || 1
  const cropStageWidth = Math.min(300, 300 * safeCropRatio)
  const cropWindowWidth = Math.min(1, 1 / safeCropRatio)
  const cropWindowHeight = Math.min(1, safeCropRatio)
  const cropShiftX = (50 - (productDraft.imagePositionX ?? 50)) * productDraft.imageScale * (1 - cropWindowWidth)
  const cropShiftY = (50 - (productDraft.imagePositionY ?? 50)) * productDraft.imageScale * (1 - cropWindowHeight)
  async function saveBusiness(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const result = await apiRequest('/partner/business', {
        method: 'PATCH', token,
        body: {
          name: business.name,
          description: business.description,
          address: business.address,
          openingHours: business.openingHours,
          whatsapp: business.whatsapp,
          logoDataUrl: business.logoDataUrl,
          logoScale: business.logoScale,
          bannerDataUrl: business.bannerDataUrl,
          primaryColor: business.primaryColor,
          secondaryColor: business.secondaryColor,
          fontFamily: business.fontFamily || 'original',
          deliveryEnabled: business.deliveryEnabled !== false,
          addonsEnabled: business.addonsEnabled !== false,
        },
      })
      setBusiness(result.business)
      flash('Perfil del local actualizado.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  function toggleBonusDay(day) {
    const selectedDays = new Set(business.bonusPointsDays || [])
    if (selectedDays.has(day)) selectedDays.delete(day)
    else selectedDays.add(day)
    updateBusiness('bonusPointsDays', [...selectedDays].sort((first, second) => first - second))
  }

  async function saveBonusDays() {
    setIsSaving(true)
    setError('')
    try {
      const result = await apiRequest('/partner/bonus-days', {
        method: 'PATCH', token,
        body: { days: business.bonusPointsDays || [] },
      })
      setBusiness((current) => ({
        ...current,
        bonusPointsDays: result.bonusPointsDays,
        bonusPointsActiveToday: result.bonusPointsActiveToday,
      }))
      flash('Días de puntos dobles guardados.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  async function saveReferrals() {
    const points = Number(business.referralPoints)
    if (business.referralEnabled && (!Number.isInteger(points) || points < 1)) {
      setError('Ingresá cuántos puntos recibe quien invita (mínimo 1).')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const result = await apiRequest('/partner/referrals', {
        method: 'PATCH', token,
        body: { enabled: Boolean(business.referralEnabled), points: Number.isInteger(points) ? points : 0 },
      })
      setBusiness((current) => ({ ...current, ...result }))
      flash('Programa de invitar amigos guardado.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  async function saveProduct(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    const body = { ...productDraft, price: Number(productDraft.price), pointsPerUnit: Number(productDraft.pointsPerUnit) }
    try {
      if (body.imageDataUrl) {
        body.imageDataUrl = await cropProductImage(
          body.imageDataUrl,
          Number(body.imageScale) || 1,
          Number(body.imagePositionX ?? 50),
          Number(body.imagePositionY ?? 50),
        )
        body.imageScale = 1
        body.imagePositionX = 50
        body.imagePositionY = 50
      }
      const result = editingProductId
        ? await apiRequest(`/partner/products/${editingProductId}`, { method: 'PATCH', token, body })
        : await apiRequest('/partner/products', { method: 'POST', token, body })
      setProducts((current) => editingProductId
        ? current.map((product) => product.id === editingProductId ? result.product : product)
        : [result.product, ...current])
      setSelectedCategory(result.product.category)
      setProductDraft({ ...emptyProduct, category: result.product.category })
      setEditingProductId(null)
      flash(editingProductId ? 'Producto actualizado.' : 'Producto agregado.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  async function removeProduct(productId) {
    try {
      await apiRequest(`/partner/products/${productId}`, { method: 'DELETE', token })
      const remainingProducts = products.filter((product) => product.id !== productId)
      setProducts(remainingProducts)
      flash('Producto quitado del menú.')
    } catch (deleteError) { setError(deleteError.message) }
  }

  async function saveCategory(event) {
    event.preventDefault()
    const nextName = categoryDraft.trim()
    if (!nextName || nextName.length > 60) {
      setError('El nombre de la categoría debe tener entre 1 y 60 caracteres.')
      return
    }
    if (nextName === editingCategory) {
      setEditingCategory(null)
      return
    }
    setBusyCategory(editingCategory)
    setError('')
    try {
      await apiRequest('/partner/categories', {
        method: 'PATCH', token,
        body: { currentName: editingCategory, name: nextName },
      })
      setCategories((current) => current.map((category) => category.name === editingCategory ? { ...category, name: nextName } : category).sort((first, second) => first.name.localeCompare(second.name, 'es')))
      setProducts((current) => current.map((product) => product.category === editingCategory ? { ...product, category: nextName } : product))
      setSelectedCategory((current) => current === editingCategory ? nextName : current)
      setProductDraft((current) => current.category === editingCategory ? { ...current, category: nextName } : current)
      setEditingCategory(null)
      setCategoryDraft('')
      flash('Categoría actualizada.')
    } catch (saveError) { setError(saveError.message) } finally { setBusyCategory(null) }
  }

  async function saveCategoryAddon(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    const body = { category: selectedCategory, name: addonDraft.name, price: Number(addonDraft.price) }
    try {
      const result = editingAddonId
        ? await apiRequest(`/partner/category-addons/${editingAddonId}`, { method: 'PATCH', token, body })
        : await apiRequest('/partner/category-addons', { method: 'POST', token, body })
      setCategoryAddons((current) => editingAddonId
        ? current.map((addon) => addon.id === editingAddonId ? result.addon : addon)
        : [...current, result.addon])
      setAddonDraft({ name: '', price: '' })
      setEditingAddonId(null)
      flash(editingAddonId ? 'Agregado actualizado.' : 'Agregado agregado a la categoría.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  function startEditingAddon(addon) {
    setEditingAddonId(addon.id)
    setAddonDraft({ name: addon.name, price: String(addon.price) })
  }

  async function removeCategoryAddon(addonId) {
    try {
      await apiRequest(`/partner/category-addons/${addonId}`, { method: 'DELETE', token })
      setCategoryAddons((current) => current.filter((addon) => addon.id !== addonId))
      if (editingAddonId === addonId) {
        setEditingAddonId(null)
        setAddonDraft({ name: '', price: '' })
      }
      flash('Agregado quitado de la categoría.')
    } catch (deleteError) { setError(deleteError.message) }
  }

  async function createCategory(event) {
    event.preventDefault()
    const name = categoryDraft.trim()
    if (!name || name.length > 60) {
      setError('El nombre de la categoría debe tener entre 1 y 60 caracteres.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const result = await apiRequest('/partner/categories', { method: 'POST', token, body: { name } })
      setCategories((current) => [...current, result.category].sort((first, second) => first.name.localeCompare(second.name, 'es')))
      setCategoryDraft('')
      setIsCreatingCategory(false)
      flash('Categoría creada.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  async function removeCategory(category) {
    const fallbackCategory = category.toLocaleLowerCase('es') === 'general' ? 'Sin categoría' : 'General'
    const productCount = products.filter((product) => product.category === category).length
    const confirmation = productCount
      ? `¿Eliminar la categoría "${category}"? Sus ${productCount} productos se moverán a "${fallbackCategory}".`
      : `¿Eliminar la categoría vacía "${category}"?`
    if (!window.confirm(confirmation)) return
    setBusyCategory(category)
    setError('')
    try {
      const result = await apiRequest('/partner/categories', { method: 'DELETE', token, body: { name: category } })
      setCategories((current) => {
        const remaining = current.filter((item) => item.name !== category)
        if (result.productsMoved > 0 && !remaining.some((item) => item.name === result.category)) remaining.push({ name: result.category, productCount: result.productsMoved })
        return remaining.sort((first, second) => first.name.localeCompare(second.name, 'es'))
      })
      setProducts((current) => current.map((product) => product.category === category ? { ...product, category: fallbackCategory } : product))
      setSelectedCategory(null)
      setEditingCategory(null)
      setCategoryDraft('')
      flash(result.productsMoved > 0 ? `Productos movidos a ${fallbackCategory}.` : 'Categoría eliminada.')
    } catch (deleteError) { setError(deleteError.message) } finally { setBusyCategory(null) }
  }

  async function saveReward(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    const body = {
      ...rewardDraft,
      productId: rewardDraft.rewardType === 'product' && rewardDraft.productId ? Number(rewardDraft.productId) : null,
      discountValue: rewardDraft.rewardType === 'discount' ? Number(rewardDraft.discountValue) : 0,
      pointsCost: Number(rewardDraft.pointsCost),
    }
    try {
      const result = editingRewardId
        ? await apiRequest(`/partner/rewards/${editingRewardId}`, { method: 'PATCH', token, body })
        : await apiRequest('/partner/rewards', { method: 'POST', token, body })
      setRewards((current) => editingRewardId
        ? current.map((reward) => reward.id === editingRewardId ? result.reward : reward)
        : [result.reward, ...current])
      setRewardDraft(emptyReward)
      setEditingRewardId(null)
      flash(editingRewardId ? 'Canje actualizado.' : 'Canje agregado.')
    } catch (saveError) { setError(saveError.message) } finally { setIsSaving(false) }
  }

  async function removeReward(rewardId) {
    try {
      await apiRequest(`/partner/rewards/${rewardId}`, { method: 'DELETE', token })
      setRewards((current) => current.filter((reward) => reward.id !== rewardId))
      flash('Canje quitado.')
    } catch (deleteError) { setError(deleteError.message) }
  }

  async function startNewShift() {
    const pending = boardOrders.filter((order) => order.status === 'in_process').length
    const warning = pending ? ` Tenés ${pending} pedido${pending === 1 ? '' : 's'} en proceso que también se van a quitar del tablero.` : ''
    if (!window.confirm(`¿Comenzar una nueva jornada? El tablero quedará vacío.${warning} Los pedidos siguen guardados en el historial.`)) return
    setIsStartingShift(true)
    setError('')
    try {
      const result = await apiRequest('/partner/orders/new-shift', { method: 'POST', token })
      setShiftStartedAt(result.shiftStartedAt)
      flash('Nueva jornada iniciada. Los pedidos anteriores están en el historial.')
    } catch (shiftError) { setError(shiftError.message) } finally { setIsStartingShift(false) }
  }

  async function changeOrderStatus(order, status) {
    if (status === 'cancelled' && !window.confirm(`¿Cancelar el pedido #${order.id}? Se restarán ${order.pointsAwarded} puntos al cliente.`)) return
    setBusyOrderId(order.id)
    setError('')
    try {
      await apiRequest(`/partner/orders/${order.id}`, { method: 'PATCH', token, body: { status } })
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item))
      await refreshStatistics()
      flash(status === 'cancelled' ? 'Pedido cancelado y puntos revertidos.' : 'Pedido marcado como enviado.')
    } catch (statusError) { setError(statusError.message) } finally { setBusyOrderId(null) }
  }

  async function selectImage(event, onImage) {
    const [file] = event.target.files || []
    if (!file) return
    try {
      onImage(await optimizeImageFile(file))
      setError('')
    } catch (imageError) { setError(imageError.message) }
    event.target.value = ''
  }

  function startProductImageDrag(event) {
    if (event.button !== 0 || event.target.closest('button')) return
    const stage = event.currentTarget
    const { width: stageWidth, height: stageHeight } = stage.getBoundingClientRect()
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: productDraft.imagePositionX,
      positionY: productDraft.imagePositionY,
      overflowX: stageWidth * productDraft.imageScale * (1 - cropWindowWidth),
      overflowY: stageHeight * productDraft.imageScale * (1 - cropWindowHeight),
    }
    stage.setPointerCapture(event.pointerId)
  }

  function moveProductImage(event) {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const positionX = drag.overflowX ? drag.positionX - ((event.clientX - drag.startX) / drag.overflowX) * 100 : drag.positionX
    const positionY = drag.overflowY ? drag.positionY - ((event.clientY - drag.startY) / drag.overflowY) * 100 : drag.positionY
    setProductDraft((current) => ({
      ...current,
      imagePositionX: Math.max(0, Math.min(100, positionX)),
      imagePositionY: Math.max(0, Math.min(100, positionY)),
    }))
  }

  function stopProductImageDrag() {
    cropDragRef.current = null
  }

  function updateBusiness(field, value) {
    setBusiness((current) => ({ ...current, [field]: value }))
  }

  async function toggleBusinessOption(field, value) {
    setIsSaving(true)
    setError('')
    try {
      const result = await apiRequest('/partner/business/options', { method: 'PATCH', token, body: { [field]: value } })
      setBusiness((current) => ({ ...current, ...result.business }))
      flash(value ? 'Opción activada.' : 'Opción desactivada.')
    } catch (requestError) { setError(requestError.message) } finally { setIsSaving(false) }
  }

  function startEditingProduct(product) {
    setEditingProductId(product.id)
    setSelectedCategory(product.category)
    setProductDraft({ ...product, price: String(product.price), pointsPerUnit: String(product.pointsPerUnit), imageScale: product.imageScale || 1, imagePositionX: product.imagePositionX ?? 50, imagePositionY: product.imagePositionY ?? 50 })
    setSection('products')
  }

  function startEditingCategory(category) {
    setEditingCategory(category)
    setCategoryDraft(category)
    setIsCreatingCategory(false)
  }

  function startEditingReward(reward) {
    setEditingRewardId(reward.id)
    const linkedProduct = products.find((product) => String(product.id) === String(reward.productId))
    setRewardDraft({
      ...emptyReward,
      ...reward,
      category: linkedProduct?.category || '',
      productId: linkedProduct ? String(linkedProduct.id) : '',
      discountValue: reward.discountValue ? String(reward.discountValue) : '',
      pointsCost: String(reward.pointsCost),
    })
    setSection('rewards')
  }

  const categoryProducts = products.filter((product) => product.category === selectedCategory)

  const boardOrders = shiftStartedAt ? orders.filter((order) => new Date(order.createdAt) >= new Date(shiftStartedAt)) : orders
  const isPastGracePeriod = billing && currentTime > new Date(billing.graceEndsAt).getTime()
  const isInGracePeriod = billing && currentTime > new Date(billing.dueAt).getTime() && !isPastGracePeriod
  const isSuspended = billing?.status === 'suspended' || isPastGracePeriod
  const visibleSections = isSuspended ? sections.filter((item) => item.id === 'billing') : sections
  const daysToDue = billing ? calendarDaysBetween(new Date(currentTime), new Date(billing.dueAt)) : null
  const billingAlert = !billing || isSuspended ? '' : billing.status === 'grace'
    ? `Tu suscripción venció. Tenés hasta el ${formatLongDate(billing.graceEndsAt)} para pagar; después tu cuenta se suspende.`
    : isInGracePeriod ? `Tu suscripción venció. Tenés hasta el ${formatLongDate(billing.graceEndsAt)} para pagar; después tu cuenta se suspende.`
      : daysToDue <= 5 ? `Tu suscripción vence ${daysToDue <= 0 ? 'hoy' : daysToDue === 1 ? 'mañana' : `en ${daysToDue} días`} (${formatLongDate(billing.dueAt)}).` : ''

  if (isLoading) return <main className={styles.loading}><LoaderCircle size={21} className={styles.spinner} /> Preparando el panel del local...</main>
  if (!business) return <main className={styles.loading}><p>{error || 'No encontramos el local de esta cuenta.'}</p><button className={styles.logoutButton} type="button" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</button></main>

  return (
    <main className={styles.shell} style={{ ...getBusinessFontVariables(business.fontFamily), '--store-primary': business.primaryColor || '#c95031', '--store-secondary': business.secondaryColor || '#58705e', '--logo-scale': business.logoScale || 1 }}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href={`/local/${business.slug}`} target="_blank" rel="noreferrer">
          <span className={styles.brandMark}>{business.logoDataUrl ? <img src={business.logoDataUrl} alt="" /> : <Store size={18} />}</span>
          <span><strong>{business.name}</strong><small>Panel del local</small></span>
          <ArrowUpRight className={styles.brandArrow} size={16} />
        </a>
        <span className={styles.sidebarLabel}>GESTIÓN</span>
        <nav className={styles.navigation} aria-label="Secciones del panel">
          {visibleSections.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`${styles.navItem} ${section === id ? styles.navActive : ''}`} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
              <Icon size={17} /><span className={styles.navLabel}>{label}</span>
              {(id === 'bonus-points' || id === 'catalog-import') && <span className={styles.navVip}>VIP</span>}
              {id === 'orders' && orders.filter((order) => order.status === 'in_process').length > 0 && <span className={styles.navCount}>{orders.filter((order) => order.status === 'in_process').length}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <span className={styles.planPill}>{business.plan === 'vip' ? 'Plan VIP' : 'Plan Básico'}</span>
          <span className={styles.ownerName}>{user.firstName} {user.lastName}</span>
          <button className={styles.logoutButton} type="button" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.topbar}>
          <div><span className={styles.eyebrow}>{business.name}</span><h1>{sections.find((item) => item.id === section)?.label}</h1></div>
          {section === 'store' && <button className={styles.topbarSaveButton} type="submit" form="business-settings-form" disabled={isSaving || !business.bannerDataUrl}><Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar cambios'}</button>}
        </header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.toast} role="status">{message}</p>}
        {billingAlert && section !== 'billing' && <button type="button" className={styles.billingAlert} onClick={() => setSection('billing')}><AlertCircle size={16} /> {billingAlert} <strong>Ver suscripción</strong></button>}

        {section === 'billing' && <BillingPanel token={token} billing={billing} isSuspended={isSuspended} onError={setError} />}
        {section === 'orders' && <>
          <div className={styles.ordersToolbar}>
            <button type="button" className={styles.shiftButton} disabled={isStartingShift} onClick={startNewShift}>{isStartingShift ? <LoaderCircle size={15} className={styles.spinner} /> : <RefreshCw size={15} />} Nueva jornada</button>
            <button type="button" className={styles.historyButton} onClick={() => setIsHistoryOpen(true)}><History size={15} /> Historial</button>
          </div>
          <OrdersBoard orders={boardOrders} businessName={business.name} busyOrderId={busyOrderId} onChangeStatus={changeOrderStatus} />
          {isHistoryOpen && <OrderHistory orders={orders} onClose={() => setIsHistoryOpen(false)} />}
        </>}
        {section === 'stats' && <StatisticsDashboard data={statistics} isLoading={statisticsLoading} error={statisticsError} onRefresh={refreshStatistics} />}
        {section === 'catalog-import' && <CatalogImport token={token} plan={business.plan} onImported={refreshImportedCatalog} />}
        {section === 'store' && <ShareLink slug={business.slug} />}
        {section === 'store' && <section className={styles.optionToggleCard}>
          <div><strong>Envíos a domicilio</strong><small>Si lo desactivás, los clientes solo podrán elegir retiro en el local.</small></div>
          <label className={styles.switchRow}>
            <span className={styles.switchLabel}>{business.deliveryEnabled !== false ? 'Activado' : 'Desactivado'}</span>
            <input className={styles.switchInput} type="checkbox" checked={business.deliveryEnabled !== false} disabled={isSaving} onChange={(event) => toggleBusinessOption('deliveryEnabled', event.target.checked)} aria-label="Activar envíos a domicilio" />
            <span className={styles.switchTrack} />
          </label>
        </section>}
        {section === 'store' && <form id="business-settings-form" className={styles.settingsGrid} onSubmit={saveBusiness}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeading}><h2>Identidad y página</h2><p>Estos datos se muestran en la página pública de tu local.</p></div>
            <label className={styles.fieldLabel} htmlFor="business-name">Nombre del local</label>
            <input className={styles.textInput} id="business-name" maxLength={100} value={business.name} onChange={(event) => updateBusiness('name', event.target.value)} required />
            <label className={styles.fieldLabel} htmlFor="business-description">Descripción</label>
            <textarea className={styles.textArea} id="business-description" maxLength={1000} rows={3} value={business.description} onChange={(event) => updateBusiness('description', event.target.value)} />
            <label className={styles.fieldLabel} htmlFor="business-address">Dirección</label>
            <input className={styles.textInput} id="business-address" maxLength={200} value={business.address} onChange={(event) => updateBusiness('address', event.target.value)} />
            <div className={styles.twoFields}>
              <div><label className={styles.fieldLabel} htmlFor="business-hours">Horarios</label><input className={styles.textInput} id="business-hours" maxLength={160} value={business.openingHours} onChange={(event) => updateBusiness('openingHours', event.target.value)} /></div>
              <div><label className={styles.fieldLabel} htmlFor="business-whatsapp">WhatsApp</label><input className={styles.textInput} id="business-whatsapp" type="tel" maxLength={20} value={business.whatsapp} onChange={(event) => updateBusiness('whatsapp', event.target.value)} /></div>
            </div>
          </section>
          <section className={styles.formSection}>
            <div className={styles.sectionHeading}><h2>Portada y colores</h2><p>El banner encabeza tu web; el primario marca títulos y botones, el secundario resalta puntos y detalles.</p></div>
            <label className={styles.fieldLabel} htmlFor="business-banner">Banner de la página <span className={styles.requiredMark}>Obligatorio</span></label>
            <label className={styles.bannerPreview} htmlFor="business-banner">
              {business.bannerDataUrl ? <img src={business.bannerDataUrl} alt="Vista previa del banner" /> : <span><ImagePlus size={19} /> Subir foto de banner</span>}
              {business.bannerDataUrl && <span className={styles.bannerChange}><ImagePlus size={15} /> Cambiar banner</span>}
            </label>
            <input className={styles.fileInput} id="business-banner" type="file" accept="image/*" onChange={(event) => selectImage(event, (image) => updateBusiness('bannerDataUrl', image))} />
            {!business.bannerDataUrl && <p className={styles.bannerRequired}>Subí una foto para poder guardar el perfil.</p>}

            <div className={styles.colorFields}>
              <div className={styles.colorField}>
                <label className={styles.fieldLabel} htmlFor="business-primary-color">Color primario</label>
                <div className={styles.colorControl}><input id="business-primary-color" type="color" value={business.primaryColor || '#c95031'} onChange={(event) => updateBusiness('primaryColor', event.target.value)} /><code>{business.primaryColor || '#c95031'}</code></div>
                <small>Títulos y botones principales</small>
              </div>
              <div className={styles.colorField}>
                <label className={styles.fieldLabel} htmlFor="business-secondary-color">Color secundario</label>
                <div className={styles.colorControl}><input id="business-secondary-color" type="color" value={business.secondaryColor || '#58705e'} onChange={(event) => updateBusiness('secondaryColor', event.target.value)} /><code>{business.secondaryColor || '#58705e'}</code></div>
                <small>Puntos, etiquetas y acentos</small>
              </div>
            </div>

            <label className={styles.fieldLabel} htmlFor="business-font">Tipografía de la página</label>
            <select className={styles.textInput} id="business-font" value={business.fontFamily || 'original'} onChange={(event) => updateBusiness('fontFamily', event.target.value)}>
              {businessFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
            </select>

            <div className={styles.sectionHeading}><h2>Logo del local</h2><p>Se muestra junto al nombre en la navegación.</p></div>
            <label className={styles.logoPreview} htmlFor="business-logo">
              {business.logoDataUrl ? <img src={business.logoDataUrl} alt="Vista previa del logo" style={{ '--logo-scale': business.logoScale || 1 }} /> : <Store size={30} />}
              <span><ImagePlus size={16} /> Cambiar logo</span>
            </label>
            <input className={styles.fileInput} id="business-logo" type="file" accept="image/*" onChange={(event) => selectImage(event, (image) => updateBusiness('logoDataUrl', image))} />
            <div className={styles.logoZoomLabel}><label htmlFor="business-logo-scale">Encuadre del logo</label><output htmlFor="business-logo-scale">{Number(business.logoScale || 1).toFixed(2)}×</output></div>
            <input className={styles.logoZoom} id="business-logo-scale" type="range" min="1" max="3" step="0.05" value={business.logoScale || 1} onChange={(event) => updateBusiness('logoScale', Number(event.target.value))} />
            <small className={styles.logoHelp}>Acercá la imagen para recortar los márgenes sobrantes.</small>
            {business.logoDataUrl && <button className={styles.textButton} type="button" onClick={() => updateBusiness('logoDataUrl', '')}>Quitar logo</button>}
            <div className={styles.planSummary}><span>Plan asignado</span><strong>{business.plan === 'vip' ? 'VIP' : 'Básico'}</strong></div>
          </section>
        </form>}

        {section === 'preview' && <LocalStorefront
          slug={business.slug}
          session={null}
          onAuthenticate={() => {}}
          onSignOut={() => {}}
          isPreview
          previewData={{ business, products, rewards, addons: categoryAddons }}
        />}

        {section === 'products' && (selectedCategory ? <section className={styles.categoryDetail}>
          <header className={styles.categoryDetailHeader}>
            <div>
              <button className={styles.backButton} type="button" onClick={() => { setSelectedCategory(null); setEditingProductId(null); setProductDraft(emptyProduct) }}><ArrowLeft size={17} /> Volver a categorías</button>
              <h2>{selectedCategory}</h2>
              <p>{categoryProducts.length} productos</p>
            </div>
            <span className={styles.categoryContext}><FolderOpen size={15} /> Categoría seleccionada</span>
          </header>
          <section className={styles.addonManager}>
            <div className={styles.sectionHeading}><h2>Agregados para {selectedCategory}</h2><p>Se ofrecen como opciones adicionales en todos los productos de esta categoría.</p></div>
            <div className={styles.addonToggleRow}>
              <p>Opciones para todos los productos de esta categoría</p>
              <label className={styles.switchRow}>
                <span className={styles.switchLabel}>{business.addonsEnabled !== false ? 'Activados' : 'Desactivados'}</span>
                <input className={styles.switchInput} type="checkbox" checked={business.addonsEnabled !== false} disabled={isSaving} onChange={(event) => toggleBusinessOption('addonsEnabled', event.target.checked)} aria-label="Activar agregados" />
                <span className={styles.switchTrack} />
              </label>
            </div>
            <form className={styles.addonForm} onSubmit={saveCategoryAddon}>
              <div><label className={styles.fieldLabel} htmlFor="addon-name">Nombre del agregado</label><input className={styles.textInput} id="addon-name" maxLength={80} placeholder="Ej: Extra salsa, porción grande, sin gluten..." value={addonDraft.name} onChange={(event) => setAddonDraft({ ...addonDraft, name: event.target.value })} required /></div>
              <div><label className={styles.fieldLabel} htmlFor="addon-price">Precio adicional</label><input className={styles.textInput} id="addon-price" type="number" min="0" max="100000000" step="1" value={addonDraft.price} onChange={(event) => setAddonDraft({ ...addonDraft, price: event.target.value })} required /></div>
              <div className={styles.addonFormActions}><button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : editingAddonId ? 'Guardar' : 'Agregar opción'}</button>{editingAddonId && <button className={styles.textButton} type="button" onClick={() => { setEditingAddonId(null); setAddonDraft({ name: '', price: '' }) }}>Cancelar</button>}</div>
            </form>
            {categoryAddons.filter((addon) => addon.category === selectedCategory).length === 0
              ? <p className={styles.addonEmpty}>Todavía no hay agregados en esta categoría.</p>
              : <div className={styles.addonList}>{categoryAddons.filter((addon) => addon.category === selectedCategory).map((addon) => <article className={styles.addonRow} key={addon.id}>
                <div className={styles.rowMain}><strong>{addon.name}</strong><span>{addon.price === 0 ? 'Sin cargo' : `+${currency.format(addon.price)}`}</span></div>
                <button className={styles.iconButton} type="button" title={`Editar ${addon.name}`} aria-label={`Editar ${addon.name}`} onClick={() => startEditingAddon(addon)}><Pencil size={15} /></button>
                <button className={styles.deleteButton} type="button" title={`Quitar ${addon.name}`} aria-label={`Quitar ${addon.name}`} onClick={() => removeCategoryAddon(addon.id)}><Trash2 size={15} /></button>
              </article>)}</div>}
          </section>
          <div className={styles.managementGrid}>
            <form className={styles.formSection} onSubmit={saveProduct}>
              <div className={styles.sectionHeading}><h2>{editingProductId ? 'Editar producto' : 'Agregar producto'}</h2><p>Se guardará en {selectedCategory}.</p></div>
              <label className={styles.fieldLabel} htmlFor="product-name">Nombre</label><input className={styles.textInput} id="product-name" maxLength={100} value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} required />
              <label className={styles.fieldLabel} htmlFor="product-description">Descripción</label><textarea className={styles.textArea} id="product-description" maxLength={500} rows={3} value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} />
              <div className={styles.twoFields}><div><label className={styles.fieldLabel} htmlFor="product-price">Precio</label><input className={styles.textInput} id="product-price" type="number" min="1" step="1" value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} required /></div><div><label className={styles.fieldLabel} htmlFor="product-points">Puntos por unidad</label><input className={styles.textInput} id="product-points" type="number" min="0" step="1" value={productDraft.pointsPerUnit} onChange={(event) => setProductDraft({ ...productDraft, pointsPerUnit: event.target.value })} required /></div></div>
              <label className={styles.fieldLabel} htmlFor="product-image">Foto</label><input className={styles.fileInput} id="product-image" type="file" accept="image/*" onChange={(event) => selectImage(event, (image) => { setProductDraft((current) => ({ ...current, imageDataUrl: image, imageScale: 1, imagePositionX: 50, imagePositionY: 50 })); setCropImageRatio(1) })} />
              {productDraft.imageDataUrl && <>
                <div className={styles.imageCropStage} style={{ width: `${cropStageWidth}px`, aspectRatio: safeCropRatio }} onPointerDown={startProductImageDrag} onPointerMove={moveProductImage} onPointerUp={stopProductImageDrag} onPointerCancel={stopProductImageDrag}>
                  <img className={styles.imageCropFull} src={productDraft.imageDataUrl} alt="" draggable="false" style={{ transform: `translate(${cropShiftX}%, ${cropShiftY}%) scale(${productDraft.imageScale})` }} onLoad={(event) => setCropImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
                  <div className={styles.imageCropWindow} style={{ width: `${cropWindowWidth * 100}%`, height: `${cropWindowHeight * 100}%` }}>
                    <img src={productDraft.imageDataUrl} alt="Vista del recorte del producto" draggable="false" style={{ '--image-scale': productDraft.imageScale, '--image-position-x': `${productDraft.imagePositionX}%`, '--image-position-y': `${productDraft.imagePositionY}%` }} />
                  </div>
                  <button type="button" aria-label="Quitar foto" onClick={() => setProductDraft({ ...productDraft, imageDataUrl: '' })}><X size={16} /></button>
                </div>
                <small className={styles.imageZoomHelp}>Arrastrá la foto para elegir el encuadre. El área dentro del marco es la que se guarda.</small>
              </>}
              {productDraft.imageDataUrl && <>
                <div className={styles.imageZoomLabel}><label htmlFor="product-image-scale">Encuadre de la foto</label><output htmlFor="product-image-scale">{Number(productDraft.imageScale).toFixed(2)}×</output></div>
                <input className={styles.imageZoom} id="product-image-scale" type="range" min="1" max="3" step="0.05" value={productDraft.imageScale} onChange={(event) => setProductDraft({ ...productDraft, imageScale: Number(event.target.value) })} />
              </>}
              <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : editingProductId ? 'Guardar producto' : 'Agregar producto'}</button>{editingProductId && <button className={styles.textButton} type="button" onClick={() => { setEditingProductId(null); setProductDraft({ ...emptyProduct, category: selectedCategory }) }}>Cancelar edición</button>}</div>
            </form>
            <div className={styles.listSection}>
              <div className={styles.sectionHeading}><h2>Productos</h2><p>{categoryProducts.length} disponibles</p></div>
              {categoryProducts.length === 0 ? <p className={styles.empty}>Todavía no hay productos en esta categoría.</p> : categoryProducts.map((product) => (
                <article className={styles.productRow} key={product.id}>
                  <div className={styles.productThumb}>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" style={{ '--image-scale': product.imageScale || 1, '--image-position-x': `${product.imagePositionX ?? 50}%`, '--image-position-y': `${product.imagePositionY ?? 50}%` }} /> : <Package size={18} />}</div>
                  <div className={styles.rowMain}><strong>{product.name}</strong><span>{currency.format(product.price)} · {product.pointsPerUnit} pts/u</span></div>
                  <button className={styles.iconButton} type="button" title="Editar producto" aria-label={`Editar ${product.name}`} onClick={() => startEditingProduct(product)}><Pencil size={16} /></button>
                  <button className={styles.deleteButton} type="button" title="Eliminar producto" aria-label={`Eliminar ${product.name}`} onClick={() => removeProduct(product.id)}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          </div>
        </section> : <section className={styles.categoryPage}>
          <header className={styles.categoryPageHeader}>
            <div><span className={styles.eyebrow}>CATÁLOGO</span><h2>Categorías</h2><p>Organizá el menú antes de cargar los productos.</p></div>
            <button className={styles.primaryButton} type="button" onClick={() => { setIsCreatingCategory(true); setEditingCategory(null); setCategoryDraft(''); setError('') }} disabled={isCreatingCategory}><Plus size={16} /> Nueva categoría</button>
          </header>
          {isCreatingCategory && <form className={styles.categoryCreateForm} onSubmit={createCategory}>
            <div><label className={styles.fieldLabel} htmlFor="new-category-name">Nombre de la categoría</label><input className={styles.textInput} id="new-category-name" maxLength={60} value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} autoFocus required /></div>
            <button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Crear categoría'}</button>
            <button className={styles.textButton} type="button" onClick={() => { setIsCreatingCategory(false); setCategoryDraft('') }}>Cancelar</button>
          </form>}
          {categories.length === 0 && !isCreatingCategory ? <p className={styles.empty}>Todavía no hay categorías. Creá una para empezar el menú.</p> : <div className={styles.categoriesGrid}>
            {categories.map((category) => {
              const coverProduct = products.find((product) => product.category === category.name && product.imageDataUrl)
              const productCount = products.filter((product) => product.category === category.name).length
              return <article className={styles.categoryCard} key={category.name}>
                {editingCategory === category.name ? <form className={styles.categoryEditForm} onSubmit={saveCategory}>
                  <label className={styles.fieldLabel} htmlFor={`edit-category-${category.name}`}>Nombre de la categoría</label>
                  <input className={styles.textInput} id={`edit-category-${category.name}`} maxLength={60} value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} autoFocus required />
                  <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={busyCategory === category.name}>Guardar</button><button className={styles.textButton} type="button" onClick={() => { setEditingCategory(null); setCategoryDraft('') }}>Cancelar</button></div>
                </form> : <>
                  <button className={styles.categoryCardOpen} type="button" onClick={() => { setSelectedCategory(category.name); setProductDraft({ ...emptyProduct, category: category.name }); setEditingProductId(null) }}>
                    <span className={styles.categoryCover}>{coverProduct ? <img src={coverProduct.imageDataUrl} alt="" style={{ '--image-scale': coverProduct.imageScale || 1, '--image-position-x': `${coverProduct.imagePositionX ?? 50}%`, '--image-position-y': `${coverProduct.imagePositionY ?? 50}%` }} /> : <FolderOpen size={30} />}</span>
                    <span className={styles.categoryCardInfo}><strong>{category.name}</strong><small>{productCount} {productCount === 1 ? 'producto' : 'productos'}</small></span>
                    <ChevronRight size={18} />
                  </button>
                  <div className={styles.categoryCardActions}>
                    <button className={styles.iconButton} type="button" title="Editar categoría" aria-label={`Editar categoría ${category.name}`} onClick={() => startEditingCategory(category.name)}><Pencil size={16} /></button>
                    <button className={styles.deleteButton} type="button" title="Eliminar categoría" aria-label={`Eliminar categoría ${category.name}`} onClick={() => removeCategory(category.name)}><Trash2 size={16} /></button>
                  </div>
                </>}
              </article>
            })}
          </div>}
        </section>)}

        {section === 'rewards' && <div className={styles.managementGrid}>
          <form className={styles.formSection} onSubmit={saveReward}>
            <div className={styles.sectionHeading}><h2>{editingRewardId ? 'Editar canje' : 'Nuevo canje'}</h2><p>Define qué recompensa pueden obtener los clientes con puntos.</p></div>
            <label className={styles.fieldLabel} htmlFor="reward-type">Tipo de canje</label><select className={styles.textInput} id="reward-type" value={rewardDraft.rewardType || 'product'} onChange={(event) => setRewardDraft({ ...rewardDraft, rewardType: event.target.value, category: '', productId: '', discountValue: '' })}><option value="product">Producto</option><option value="discount">Descuento sobre una compra</option></select>
            {rewardDraft.rewardType === 'product' && <>
              <label className={styles.fieldLabel} htmlFor="reward-category">Categoría del producto</label>
              <select className={styles.textInput} id="reward-category" value={rewardDraft.category || ''} onChange={(event) => setRewardDraft({ ...rewardDraft, category: event.target.value, productId: '' })} required>
                <option value="">Elegí una categoría</option>
                {categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
              </select>
              <label className={styles.fieldLabel} htmlFor="reward-product">Producto a canjear</label>
              <select className={styles.textInput} id="reward-product" value={rewardDraft.productId || ''} onChange={(event) => setRewardDraft({ ...rewardDraft, productId: event.target.value })} required disabled={!rewardDraft.category}>
                <option value="">Elegí un producto</option>
                {products.filter((product) => product.category === rewardDraft.category).map((product) => <option key={product.id} value={product.id}>{product.name} · {currency.format(product.price)}</option>)}
              </select>
              {rewardDraft.category && products.every((product) => product.category !== rewardDraft.category) && <small className={styles.imageZoomHelp}>Esta categoría todavía no tiene productos disponibles.</small>}
            </>}
            <label className={styles.fieldLabel} htmlFor="reward-name">{rewardDraft.rewardType === 'discount' ? 'Nombre del descuento' : 'Recompensa'}</label><input className={styles.textInput} id="reward-name" maxLength={100} value={rewardDraft.name} onChange={(event) => setRewardDraft({ ...rewardDraft, name: event.target.value })} required />
            <label className={styles.fieldLabel} htmlFor="reward-description">Descripción</label><textarea className={styles.textArea} id="reward-description" rows={3} maxLength={500} value={rewardDraft.description} onChange={(event) => setRewardDraft({ ...rewardDraft, description: event.target.value })} />
            {rewardDraft.rewardType === 'discount' && <>
              <label className={styles.fieldLabel} htmlFor="reward-discount-type">Tipo de descuento</label><select className={styles.textInput} id="reward-discount-type" value={rewardDraft.discountType || 'fixed'} onChange={(event) => setRewardDraft({ ...rewardDraft, discountType: event.target.value, discountValue: '' })}><option value="fixed">Monto fijo</option><option value="percentage">Porcentaje</option></select>
              <label className={styles.fieldLabel} htmlFor="reward-discount-value">{rewardDraft.discountType === 'percentage' ? 'Porcentaje' : 'Monto en pesos'}</label><input className={styles.textInput} id="reward-discount-value" type="number" min="1" max={rewardDraft.discountType === 'percentage' ? '100' : '100000000'} step="1" value={rewardDraft.discountValue} onChange={(event) => setRewardDraft({ ...rewardDraft, discountValue: event.target.value })} required />
              <small className={styles.imageZoomHelp}>Se aplica sobre la compra al confirmar el pedido.</small>
            </>}
            <label className={styles.fieldLabel} htmlFor="reward-image">Foto opcional</label><input className={styles.fileInput} id="reward-image" type="file" accept="image/*" onChange={(event) => selectImage(event, (image) => setRewardDraft((current) => ({ ...current, imageDataUrl: image })))} />
            {rewardDraft.imageDataUrl && <div className={styles.rewardPhotoPreview}><img src={rewardDraft.imageDataUrl} alt="Vista previa del canje" /><button type="button" aria-label="Quitar foto del canje" onClick={() => setRewardDraft((current) => ({ ...current, imageDataUrl: '' }))}><X size={15} /></button></div>}
            <label className={styles.fieldLabel} htmlFor="reward-cost">Puntos necesarios</label><input className={styles.textInput} id="reward-cost" type="number" min="1" step="1" value={rewardDraft.pointsCost} onChange={(event) => setRewardDraft({ ...rewardDraft, pointsCost: event.target.value })} required />
            <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : editingRewardId ? 'Guardar canje' : 'Agregar canje'}</button>{editingRewardId && <button className={styles.textButton} type="button" onClick={() => { setEditingRewardId(null); setRewardDraft(emptyReward) }}>Cancelar edición</button>}</div>
          </form>
          <div className={styles.listSection}><div className={styles.sectionHeading}><h2>Canjes disponibles</h2><p>{rewards.length} opciones</p></div>{rewards.length === 0 ? <p className={styles.empty}>Todavía no configuraste canjes.</p> : rewards.map((reward) => { const linkedProduct = products.find((product) => String(product.id) === String(reward.productId)); return <article className={styles.rewardRow} key={reward.id}>{reward.imageDataUrl && <span className={styles.rewardThumb}><img src={reward.imageDataUrl} alt="" /></span>}<div className={styles.rewardPoints}>{reward.pointsCost}<small>pts</small></div><div className={styles.rowMain}><strong>{reward.name}</strong><span>{reward.rewardType === 'discount' ? `Descuento ${reward.discountType === 'percentage' ? `${reward.discountValue}%` : currency.format(reward.discountValue)} · ${reward.description || 'aplicable a una compra'}` : linkedProduct ? `Producto: ${linkedProduct.name} · ${reward.description || 'Canje por puntos'}` : reward.description || 'Producto'}</span></div><button className={styles.rowButton} type="button" onClick={() => startEditingReward(reward)}>Editar</button><button className={styles.deleteButton} type="button" aria-label={`Quitar ${reward.name}`} onClick={() => removeReward(reward.id)}><Trash2 size={16} /></button></article>})}</div>
        </div>}

        {section === 'customers' && <section className={styles.formSection}><div className={styles.sectionHeading}><h2>Clientes del local</h2><p>Personas que hicieron al menos un pedido en tu local.</p></div>{customers.length === 0 ? <p className={styles.empty}>Todavía no hay clientes registrados.</p> : <div className={styles.tableWrap}><table className={styles.customerTable}><thead><tr><th>Nombre</th><th>Apellido</th><th>Celular</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.phone}><td>{customer.firstName}</td><td>{customer.lastName}</td><td><a href={`tel:${customer.phone}`}>{customer.phone}</a></td></tr>)}</tbody></table></div>}</section>}

        {section === 'referrals' && <section className={styles.formSection}>
          <div className={styles.referralCard}>
            <div className={styles.referralHead}>
              <span className={styles.referralIcon}><UserPlus size={20} /></span>
              <div>
                <h2>Programa de invitados</h2>
                <p>Tus clientes comparten un link y, cuando la persona invitada hace su primera compra y el pedido se marca como enviado, quien invitó suma los puntos que definas.</p>
              </div>
              <label className={styles.switchRow}>
                <input className={styles.switchInput} type="checkbox" role="switch" aria-label="Activar programa de invitados" checked={Boolean(business.referralEnabled)} onChange={(event) => updateBusiness('referralEnabled', event.target.checked)} />
                <span className={styles.switchTrack} aria-hidden="true" />
                <span className={styles.switchLabel}>{business.referralEnabled ? 'Activado' : 'Desactivado'}</span>
              </label>
            </div>
            {business.referralEnabled && <div className={styles.referralBody}>
              <label className={styles.referralPoints}>
                <span>Puntos que recibe quien invita</span>
                <div className={styles.referralPointsField}><input type="number" min="1" max="100000" step="1" inputMode="numeric" placeholder="Ej: 50" value={business.referralPoints || ''} onChange={(event) => updateBusiness('referralPoints', event.target.value.replace(/\D/g, '').slice(0, 6))} /><em>puntos</em></div>
              </label>
            </div>}
            <div className={styles.referralFooter}>
              <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={saveReferrals}>{isSaving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </section>}

        {section === 'bonus-points' && <section className={`${styles.listSection} ${business.plan !== 'vip' ? styles.vipLocked : ''}`}>
          {business.plan === 'vip' ? <>
            <div className={styles.sectionHeading}><h2>Puntos dobles por día</h2><p>Elegí cuándo tus clientes acumulan el doble de los puntos habituales. Se aplica a los pedidos confirmados en horario de Argentina.</p></div>
            <div className={styles.weekdayGrid}>{weekDays.map((day) => {
              const selected = (business.bonusPointsDays || []).includes(day.value)
              return <label className={`${styles.weekdayOption} ${selected ? styles.weekdaySelected : ''}`} key={day.value}>
                <input type="checkbox" checked={selected} onChange={() => toggleBonusDay(day.value)} />
                <span>{day.label}</span>
              </label>
            })}</div>
            <div className={styles.bonusActions}><p>{business.bonusPointsActiveToday ? 'La promoción está activa hoy.' : 'La promoción no está activa hoy.'}</p><button className={styles.primaryButton} type="button" disabled={isSaving} onClick={saveBonusDays}>{isSaving ? 'Guardando...' : 'Guardar días'}</button></div>
          </> : <div className={styles.vipLock}>
            <span className={styles.vipLockIcon}><Sparkles size={23} /></span>
            <span className={styles.planPill}>Exclusivo VIP</span>
            <h2>Puntos dobles por día</h2>
            <p>Elegí días para que tus clientes acumulen el doble de puntos por cada pedido. La acumulación y los canjes habituales siguen disponibles en el Plan Básico.</p>
            <button className={styles.lockedAction} type="button" disabled>Disponible con Plan VIP</button>
          </div>}
        </section>}
      </section>
    </main>
  )
}

function StatisticsDashboard({ data, isLoading, error, onRefresh }) {
  const [period, setPeriod] = useState('daily')
  const values = data?.[period] || []
  const maxRevenue = Math.max(1, ...values.map((item) => Number(item.revenue) || 0))
  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date())

  function getPeriodLabel(item) {
    const dateValue = period === 'daily' ? item.date : `${item.month}-01`
    const date = new Date(`${dateValue}T12:00:00`)
    return new Intl.DateTimeFormat('es-AR', period === 'daily' ? { day: 'numeric', month: 'short' } : { month: 'short' }).format(date)
  }

  if (isLoading && !data) return <div className={styles.statsLoading}><LoaderCircle size={20} className={styles.spinner} /> Cargando estadísticas...</div>

  return <section className={styles.statsDashboard} aria-busy={isLoading}>
    <header className={styles.statsHeader}>
      <div><span className={styles.eyebrow}>RESUMEN DEL NEGOCIO</span><h2>{monthName}</h2></div>
      <button className={styles.statsRefresh} type="button" onClick={onRefresh} disabled={isLoading}><RefreshCw size={15} /> Actualizar</button>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {data && <>
      <div className={styles.statsKpis}>
        <article className={styles.statsKpi}><span>Ventas del mes</span><strong>{currency.format(data.summary.revenue)}</strong><small>Pedidos no cancelados</small></article>
        <article className={styles.statsKpi}><span>Pedidos</span><strong>{data.summary.orders.toLocaleString('es-AR')}</strong><small>Registrados este mes</small></article>
        <article className={styles.statsKpi}><span>Unidades vendidas</span><strong>{data.summary.unitsSold.toLocaleString('es-AR')}</strong><small>Productos en pedidos válidos</small></article>
        <article className={styles.statsKpi}><span>Ticket promedio</span><strong>{currency.format(data.summary.averageOrder)}</strong><small>Por pedido no cancelado</small></article>
      </div>

      <section className={styles.statsPanel}>
        <header className={styles.statsPanelHeader}>
          <div><h3>Ventas</h3><p>{period === 'daily' ? 'Últimos 14 días' : 'Últimos 12 meses'}</p></div>
          <div className={styles.statsPeriod} role="tablist" aria-label="Período de ventas">
            <button type="button" role="tab" aria-selected={period === 'daily'} className={period === 'daily' ? styles.statsPeriodActive : ''} onClick={() => setPeriod('daily')}>Días</button>
            <button type="button" role="tab" aria-selected={period === 'monthly'} className={period === 'monthly' ? styles.statsPeriodActive : ''} onClick={() => setPeriod('monthly')}>Meses</button>
          </div>
        </header>
        {values.length > 0 ? <div className={styles.statsChart}>
          {values.map((item) => {
            const revenue = Number(item.revenue) || 0
            const barHeight = revenue ? Math.max(3, revenue / maxRevenue * 100) : 0
            return <div className={styles.statsBarColumn} key={period === 'daily' ? item.date : item.month} title={`${getPeriodLabel(item)} · ${currency.format(revenue)} · ${item.orders} pedidos`}>
              <div className={styles.statsBarTrack}><span className={styles.statsBar} style={{ height: `${barHeight}%` }} /></div>
              <span className={styles.statsBarLabel}>{getPeriodLabel(item)}</span>
            </div>
          })}
        </div> : <p className={styles.statsEmpty}>Todavía no hay ventas para mostrar.</p>}
        <p className={styles.statsNote}>{data.summary.cancelledOrders} pedidos cancelados este mes, excluidos de las ventas.</p>
      </section>

      <div className={styles.statsRankings}>
        <SalesRanking title="Por categoría" rows={data.categories} nameKey="category" />
        <SalesRanking title="Productos más vendidos" rows={data.products} nameKey="name" />
      </div>
    </>}
  </section>
}

function SalesRanking({ title, rows, nameKey }) {
  const maxUnits = Math.max(1, ...rows.map((row) => Number(row.units) || 0))
  return <section className={styles.statsPanel}>
    <header className={styles.statsPanelHeader}><div><h3>{title}</h3><p>Unidades vendidas este mes</p></div></header>
    {rows.length ? <div className={styles.statsRankingList}>{rows.map((row) => <div className={styles.statsRankingRow} key={row[nameKey]}>
      <div className={styles.statsRankingHeading}><strong>{row[nameKey]}</strong><span>{row.units} u. · {currency.format(Number(row.revenue))}</span></div>
      <div className={styles.statsRankTrack}><span style={{ width: `${Number(row.units) / maxUnits * 100}%` }} /></div>
    </div>)}</div> : <p className={styles.statsEmpty}>Todavía no hay productos vendidos este mes.</p>}
  </section>
}

function OrderTicket({ order, businessName }) {
  const money = (value) => currency.format(value)
  const date = new Date(order.createdAt)
  const zone = 'America/Argentina/Buenos_Aires'
  const datePart = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: zone }).format(date)
  const timePart = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(date)
  const groups = new Map()
  for (const item of order.items) {
    const category = item.isReward ? 'Canje' : item.category || 'Otros'
    groups.set(category, [...(groups.get(category) || []), item])
  }
  const isDelivery = order.fulfillmentType === 'delivery'
  const mapUrl = order.deliveryLat != null
    ? `https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`
  return <div className={styles.printTicket}>
    <header><strong>{businessName}</strong></header>
    <p><b>Pedido:</b> #{order.id}{order.publicCode ? ` / ${order.publicCode}` : ''}</p>
    <p><b>Fecha:</b> {datePart} - {timePart}hs</p>
    <p><b>Nombre:</b> {order.firstName} {order.lastName}</p>
    <p><b>Teléfono:</b> {order.phone}</p>
    {order.paymentMethod && <p className={styles.ticketGap}><b>Forma de pago:</b> {order.paymentMethod === 'mercado_pago' ? 'Mercado Pago' : 'Efectivo'}</p>}
    {order.paymentMethod === 'cash' && order.cashPaymentAmount && <p><b>Paga con:</b> {money(order.cashPaymentAmount)} (vuelto {money(order.cashPaymentAmount - order.total)})</p>}
    <p><b>Total:</b> {money(order.total)}</p>
    {order.fulfillmentType && <p className={styles.ticketGap}><b>Entrega:</b> {isDelivery ? 'Delivery' : 'Retira en el local'}</p>}
    {isDelivery && <>
      <p><b>Dirección:</b> {order.deliveryAddress}</p>
      {order.deliveryReference && <p><b>Referencia:</b> {order.deliveryReference}</p>}
      <div className={styles.ticketQr}>
        <QRCodeSVG value={mapUrl} size={110} marginSize={1} />
        <span>Escaneá para abrir la ubicación{order.deliveryLat != null ? ' exacta' : ''}</span>
      </div>
    </>}
    {order.customerNotes && <p><b>Aclaraciones:</b> {order.customerNotes}</p>}
    <p className={styles.ticketGap}><i>Detalle del pedido</i></p>
    {[...groups].map(([category, items]) => <div className={styles.ticketGroup} key={category}>
      <b>{category}</b>
      {items.map((item, index) => <div key={`${item.id}-${index}`}>
        <p>{item.quantity}x {item.name}: {money(item.unitPrice * item.quantity)}{item.isReward ? ` (canje por ${item.pointsSpent} puntos)` : ''}</p>
        {item.addOns?.length > 0 && <div className={styles.ticketAddons}><span>Agregados:</span>{item.addOns.map((addon) => <span key={addon.id}>- {addon.name}{addon.price ? ` (+${money(addon.price)})` : ''}</span>)}</div>}
      </div>)}
    </div>)}
    {Number(order.discountAmount) > 0 && <>
      <p className={styles.ticketGap}>Subtotal: {money(order.subtotal || order.total)}</p>
      <p>Descuento {order.discountName}: -{money(order.discountAmount)} ({order.discountPointsSpent} puntos)</p>
    </>}
    <p className={styles.ticketTotal}>TOTAL: {money(order.total)}</p>
  </div>
}

const statusLabels = { in_process: 'En proceso', sent: 'Enviado', cancelled: 'Cancelado' }

function formatLongDate(value) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))
}

function calendarDaysBetween(from, to) {
  const partsForArgentina = (date) => {
    const parts = new Intl.DateTimeFormat('en', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Argentina/Buenos_Aires',
    }).formatToParts(date)
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  }
  const fromParts = partsForArgentina(from)
  const toParts = partsForArgentina(to)
  const fromDay = Date.UTC(Number(fromParts.year), Number(fromParts.month) - 1, Number(fromParts.day))
  const toDay = Date.UTC(Number(toParts.year), Number(toParts.month) - 1, Number(toParts.day))
  return Math.round((toDay - fromDay) / 86_400_000)
}

function ShareLink({ slug }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/local/${slug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.getElementById('share-link-input')
      input.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return <section className={styles.shareLink}>
    <div className={styles.sectionHeading}><h2>Link de tu local</h2><p>Copialo y pegalo en WhatsApp o redes para que tus clientes hagan pedidos.</p></div>
    <div className={styles.shareRow}>
      <input id="share-link-input" className={styles.textInput} value={url} readOnly aria-label="Link de tu local" onFocus={(event) => event.target.select()} />
      <button type="button" className={styles.copyButton} onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? '¡Copiado!' : 'Copiar link'}</button>
    </div>
  </section>
}

function BillingPanel({ token, billing, isSuspended, onError }) {
  const [isPaying, setIsPaying] = useState(false)
  if (!billing) return <p className={styles.columnEmpty}>Cargando tu suscripción...</p>
  const daysToDue = Math.ceil((new Date(billing.dueAt) - Date.now()) / 86_400_000)
  const statusText = billing.status === 'suspended'
    ? 'Cuenta suspendida'
    : billing.status === 'grace' ? 'Vencida, en período de gracia' : 'Al día'

  async function pay() {
    setIsPaying(true)
    onError('')
    try {
      const result = await apiRequest('/partner/billing/checkout', { method: 'POST', token })
      window.location.href = result.url
    } catch (payError) {
      onError(payError.message)
      setIsPaying(false)
    }
  }

  return <section className={styles.billingPanel}>
    {isSuspended && <div className={styles.billingSuspended}><AlertCircle size={18} /><div><strong>Tu cuenta está suspendida por falta de pago.</strong><p>No se borró nada: tus productos, clientes, puntos y pedidos siguen guardados. Apenas pagues, vas a poder volver a usarla y tu tienda vuelve a estar disponible.</p></div></div>}
    <div className={styles.billingCard}>
      <div className={styles.billingHead}>
        <span className={styles.planPill}>Plan {billing.planLabel}</span>
        <em className={`${styles.billingStatus} ${styles[`billing_${billing.status}`]}`}>{statusText}</em>
      </div>
      <dl className={styles.billingFacts}>
        <div><dt>Importe mensual</dt><dd>{currency.format(billing.price)}</dd></div>
        <div><dt>{billing.status === 'active' ? 'Próximo vencimiento' : 'Venció el'}</dt><dd>{formatLongDate(billing.dueAt)}</dd></div>
        {billing.status === 'active' && <div><dt>Faltan</dt><dd>{daysToDue <= 0 ? 'Vence hoy' : `${daysToDue} día${daysToDue === 1 ? '' : 's'}`}</dd></div>}
        {billing.status === 'grace' && <div><dt>Pagá hasta el</dt><dd>{formatLongDate(billing.graceEndsAt)}</dd></div>}
      </dl>
      <button type="button" className={styles.payButton} disabled={isPaying || !billing.canPay || !billing.paymentsConfigured} onClick={pay}>
        {isPaying ? <LoaderCircle size={16} className={styles.spinner} /> : <CreditCard size={16} />} Pagar {currency.format(billing.price)} con Mercado Pago
      </button>
      {!billing.paymentsConfigured && <p className={styles.billingHint}>{billing.paymentConfigurationMessage || 'El pago online todavía no está habilitado. Contactá a Dotty.'}</p>}
      {billing.paymentsConfigured && !billing.canPay && <p className={styles.billingHint}>El botón de pago se habilita 10 días antes del vencimiento.</p>}
      <p className={styles.billingHint}>Si no pagás dentro de los 5 días posteriores al vencimiento, la cuenta se suspende. No se elimina ningún dato.</p>
    </div>
    <div className={styles.billingCard}>
      <h2>Pagos realizados</h2>
      {(billing.payments || []).length === 0 ? <p className={styles.billingHint}>Todavía no registramos pagos.</p> : <ul className={styles.billingPayments}>
        {billing.payments.map((payment) => <li key={payment.id}><span>{formatLongDate(payment.paidAt)}<small>Plan {payment.plan === 'vip' ? 'VIP' : 'Básico'}{payment.periodEnd ? ` · cubre hasta el ${formatLongDate(payment.periodEnd)}` : ''}</small></span><strong>{currency.format(payment.amount)}</strong></li>)}
      </ul>}
    </div>
  </section>
}

function OrderHistory({ orders, onClose }) {
  const [selected, setSelected] = useState(null)
  const zone = 'America/Argentina/Buenos_Aires'
  const dateTime = (value) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(value))

  return <div className={styles.historyBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={styles.historyDialog} role="dialog" aria-modal="true" aria-labelledby="history-title">
      <header>
        {selected && <button type="button" className={styles.historyBack} onClick={() => setSelected(null)}><ArrowLeft size={15} /> Volver</button>}
        <h2 id="history-title">{selected ? `Pedido #${selected.id}` : 'Historial de pedidos'}</h2>
        <button type="button" className={styles.historyClose} aria-label="Cerrar" onClick={onClose}><X size={16} /></button>
      </header>
      {!selected
        ? orders.length === 0 ? <p className={styles.columnEmpty}>Todavía no hay pedidos.</p> : <ul className={styles.historyList}>
          {orders.map((order) => <li key={order.id}><button type="button" onClick={() => setSelected(order)}>
            <span><strong>#{order.id}</strong> · {order.firstName} {order.lastName}<small>{dateTime(order.createdAt)}{order.fulfillmentType ? ` · ${order.fulfillmentType === 'delivery' ? 'Delivery' : 'Retiro'}` : ''}</small></span>
            <span className={styles.historyRight}><strong>{currency.format(order.total)}</strong><em className={`${styles.historyStatus} ${styles[`status_${order.status}`] || ''}`}>{statusLabels[order.status]}</em></span>
          </button></li>)}
        </ul>
        : <div className={styles.historyDetail}>
          <dl>
            <div><dt>Fecha</dt><dd>{dateTime(selected.createdAt)}hs</dd></div>
            {selected.publicCode && <div><dt>Código</dt><dd>{selected.publicCode}</dd></div>}
            <div><dt>Estado</dt><dd>{statusLabels[selected.status]}</dd></div>
            <div><dt>Cliente</dt><dd>{selected.firstName} {selected.lastName}</dd></div>
            <div><dt>Teléfono</dt><dd><a href={`tel:${selected.phone}`}>{selected.phone}</a></dd></div>
            {selected.fulfillmentType && <div><dt>Entrega</dt><dd>{selected.fulfillmentType === 'delivery' ? 'Delivery' : 'Retira en el local'}</dd></div>}
            {selected.deliveryAddress && <div><dt>Dirección</dt><dd>{selected.deliveryAddress}</dd></div>}
            {selected.deliveryReference && <div><dt>Referencia</dt><dd>{selected.deliveryReference}</dd></div>}
            {selected.deliveryLat != null && <div><dt>Ubicación</dt><dd><a href={`https://www.google.com/maps?q=${selected.deliveryLat},${selected.deliveryLng}`} target="_blank" rel="noreferrer">Ver ubicación exacta</a></dd></div>}
            {selected.paymentMethod && <div><dt>Pago</dt><dd>{selected.paymentMethod === 'mercado_pago' ? 'Mercado Pago' : 'Efectivo'}{selected.cashPaymentAmount ? ` · paga con ${currency.format(selected.cashPaymentAmount)} (vuelto ${currency.format(selected.cashPaymentAmount - selected.total)})` : ''}</dd></div>}
            {selected.customerNotes && <div><dt>Aclaraciones</dt><dd>{selected.customerNotes}</dd></div>}
          </dl>
          <ul className={styles.historyItems}>{selected.items.map((item, index) => <li key={`${item.id}-${index}`}><span>{item.quantity} x {item.name}{item.addOns?.length > 0 && <small>Agregados: {item.addOns.map((addon) => addon.name).join(', ')}</small>}{item.isReward && <small>Canje por {item.pointsSpent} puntos</small>}</span><strong>{currency.format(item.unitPrice * item.quantity)}</strong></li>)}</ul>
          {Number(selected.discountAmount) > 0 && <p className={styles.historyLine}><span>Descuento · {selected.discountName}</span><strong>−{currency.format(selected.discountAmount)}</strong></p>}
          <p className={`${styles.historyLine} ${styles.historyTotal}`}><span>Total</span><strong>{currency.format(selected.total)}</strong></p>
          <p className={styles.pointsEarned}>{selected.status === 'cancelled' ? `${selected.pointsAwarded} puntos revertidos` : `+${selected.pointsAwarded} puntos acreditados`}</p>
        </div>}
    </section>
  </div>
}

function OrdersBoard({ orders, businessName, busyOrderId, onChangeStatus }) {
  const [printingOrderId, setPrintingOrderId] = useState(null)

  useEffect(() => {
    const clearPrintingOrder = () => setPrintingOrderId(null)
    window.addEventListener('afterprint', clearPrintingOrder)
    return () => window.removeEventListener('afterprint', clearPrintingOrder)
  }, [])

  function printTicket(orderId) {
    setPrintingOrderId(orderId)
    window.setTimeout(() => window.print(), 50)
  }

  return <div className={styles.board}>
    {orderStatuses.map((status) => {
      const columnOrders = orders.filter((order) => order.status === status.id)
      const columnHasPrintingOrder = columnOrders.some((order) => order.id === printingOrderId)
      return <section className={`${styles.orderColumn} ${columnHasPrintingOrder ? styles.printingOrderColumn : ''}`} key={status.id}>
        <header className={styles.columnHeader}><h2>{status.label}</h2><span>{columnOrders.length}</span></header>
        {columnOrders.length === 0 ? <p className={styles.columnEmpty}>Sin pedidos</p> : columnOrders.map((order) => (
          <article className={`${styles.orderCard} ${printingOrderId === order.id ? styles.printingOrder : ''}`} key={order.id}>
            <OrderTicket order={order} businessName={businessName} />
            <div className={styles.orderHeading}><strong>Pedido #{order.id}</strong><time>{new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}</time></div>
            <p className={styles.customerName}>{order.firstName} {order.lastName}</p>
            <a className={styles.orderPhone} href={`tel:${order.phone}`}>{order.phone}</a>
            {order.publicCode && <p className={styles.orderPhone}>Código: {order.publicCode}</p>}
            {order.fulfillmentType === 'pickup' && <p className={styles.orderPhone}>🏪 Retira en el local</p>}
            {order.deliveryAddress && <p className={styles.orderPhone}>🛵 Delivery: {order.deliveryAddress}{order.deliveryReference ? ` (${order.deliveryReference})` : ''}</p>}
            {order.deliveryLat != null && <a className={styles.orderPhone} href={`https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`} target="_blank" rel="noreferrer">Ver ubicación exacta</a>}
            {order.paymentMethod && <p className={styles.orderPhone}>💳 {order.paymentMethod === 'mercado_pago' ? 'Mercado Pago' : 'Efectivo'}{order.cashPaymentAmount ? ` · paga con ${currency.format(order.cashPaymentAmount)} (vuelto ${currency.format(order.cashPaymentAmount - order.total)})` : ''}</p>}
            {order.customerNotes && <p className={styles.orderPhone}>📝 {order.customerNotes}</p>}
            <ul>{order.items.map((item, index) => <li key={`${item.id}-${index}`}><span>{item.quantity} x {item.name}{item.addOns?.length > 0 && <small>Agregados: {item.addOns.map((addon) => `${addon.name} (+${currency.format(addon.price)})`).join(', ')}</small>}{item.isReward && <small>Canje por {item.pointsSpent} puntos</small>}</span><strong>{currency.format(item.unitPrice * item.quantity)}</strong></li>)}</ul>
            {Number(order.discountAmount) > 0 && <>
              <div className={styles.orderTotal}><span>Subtotal</span><strong>{currency.format(order.subtotal || order.total)}</strong></div>
              <div className={styles.orderDiscount}><span>Descuento · {order.discountName} ({order.discountPointsSpent} pts)</span><strong>−{currency.format(order.discountAmount)}</strong></div>
            </>}
            <div className={styles.orderTotal}><span>Total</span><strong>{currency.format(order.total)}</strong></div>
            <p className={styles.pointsEarned}>{order.status === 'cancelled' ? `${order.pointsAwarded} puntos revertidos` : `+${order.pointsAwarded} puntos acreditados`}</p>
            <div className={styles.orderActions}>
              <button className={styles.printTicketButton} type="button" aria-label={`Imprimir ticket del pedido ${order.id}`} title="Imprimir ticket" onClick={() => printTicket(order.id)}><Printer size={14} /></button>
              {order.status !== 'cancelled' && <>
                {order.status === 'in_process' && <button className={styles.sendButton} type="button" disabled={busyOrderId === order.id} onClick={() => onChangeStatus(order, 'sent')}><Check size={14} /> Marcar enviado</button>}
                <button className={styles.cancelButton} type="button" disabled={busyOrderId === order.id} onClick={() => onChangeStatus(order, 'cancelled')}><X size={14} /> Cancelar pedido</button>
              </>}
              {busyOrderId === order.id && <LoaderCircle size={16} className={styles.spinner} />}
            </div>
          </article>
        ))}
      </section>
    })}
  </div>
}

export default PartnerDashboard
