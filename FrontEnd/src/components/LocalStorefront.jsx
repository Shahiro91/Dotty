import { useEffect, useState } from 'react'
import { ArrowRight, Award, Flame, Gift, LoaderCircle, LogIn, MapPin, MessageCircle, Minus, Plus, Printer, ShoppingBag, Store, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { getBusinessFontVariables } from '../lib/businessStyle.js'
import { currency } from '../data/menu.js'
import AuthModal from './AuthModal.jsx'
import styles from './LocalStorefront.module.css'

const paymentLabels = { mercado_pago: 'Mercado Pago', cash: 'Efectivo' }
const fulfillmentLabel = (order) => order.fulfillmentType === 'delivery' ? `Delivery - ${order.deliveryAddress}` : 'Retira en el local'
const formatOrderDate = (value) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))

function buildWhatsappMessage(order, user, business) {
  const money = (value) => currency.format(value)
  const date = new Date(order.createdAt)
  const datePart = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
  const timePart = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
  const groups = new Map()
  for (const item of order.items) {
    const category = item.isReward ? 'Canje' : item.category || 'Otros'
    groups.set(category, [...(groups.get(category) || []), item])
  }
  const itemBlocks = [...groups].map(([category, items]) => [
    `*${category}*`,
    ...items.flatMap((item) => [
      `${item.quantity}x ${item.name}: ${money(item.unitPrice * item.quantity)}${item.isReward ? ` (canje por ${item.pointsSpent} puntos)` : ''}`,
      ...(item.addOns?.length ? ['   Agregados:', ...item.addOns.map((addon) => `   - ${addon.name}${addon.price ? ` (+${money(addon.price)})` : ''}`)] : []),
    ]),
  ].join('\n'))
  const isDelivery = order.fulfillmentType === 'delivery'
  const mapUrl = order.deliveryLat != null && order.deliveryLng != null
    ? `https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`
  const cashLine = order.paymentMethod === 'cash' && order.cashPaymentAmount
    ? [`*Paga con:* ${money(order.cashPaymentAmount)} (vuelto ${money(order.cashPaymentAmount - order.total)})`]
    : []
  const lines = [
    `Hola ${business.name}! Quiero hacerte un pedido`,
    '',
    `*Pedido:* #${order.id} / ${order.publicCode}`,
    `*Fecha:* ${datePart} - ${timePart}hs`,
    `*Nombre:* ${user.firstName} ${user.lastName}`.trim(),
    `*Teléfono:* ${user.phone}`,
    '',
    `*Forma de pago:* ${paymentLabels[order.paymentMethod]}`,
    ...cashLine,
    `*Total:* ${money(order.total)}`,
    '',
    `*Entrega:* ${isDelivery ? 'Delivery' : 'Retira en el local'}`,
    ...(isDelivery ? [`*Dirección:* ${order.deliveryAddress}`, ...(order.deliveryReference ? [`*Referencia:* ${order.deliveryReference}`] : []), `*Ubicación${order.deliveryLat != null ? ' exacta' : ''}:* ${mapUrl}`] : business.address ? [`*Retira en:* ${business.address}`] : []),
    ...(order.customerNotes ? [`*Aclaraciones:* ${order.customerNotes}`] : []),
    '',
    '_Detalle del pedido_',
    '',
    itemBlocks.join('\n\n'),
    '',
    ...(order.discountAmount ? [`Subtotal: ${money(order.subtotal)}`, `Descuento ${order.discountName}: -${money(order.discountAmount)} (${order.discountPointsSpent} puntos)`] : []),
    `*TOTAL: ${money(order.total)}*`,
    '',
    '_Quedo atento/a a tu confirmación y al horario estimado de entrega. Gracias!_',
  ]
  return lines.join('\n')
}

function LocalStorefront({ slug, session, onAuthenticate, onSignOut, isPreview = false, previewData = null }) {
  const [storeData, setStoreData] = useState(previewData)
  const [cart, setCart] = useState([])
  const [customizingProduct, setCustomizingProduct] = useState(null)
  const [selectedAddonIds, setSelectedAddonIds] = useState([])
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [redeemingId, setRedeemingId] = useState(null)
  const [selectedRewardId, setSelectedRewardId] = useState(null)
  const [orderReceipt, setOrderReceipt] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState(() => window.localStorage.getItem('sabor-vivo-address') || '')
  const [fulfillmentType, setFulfillmentType] = useState('')
  const [deliveryReference, setDeliveryReference] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [isLocating, setIsLocating] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [referralCode, setReferralCode] = useState('')
  const [referralCopied, setReferralCopied] = useState(false)
  const referralStorageKey = `sabor-vivo-ref-${slug}`

  useEffect(() => {
    if (isPreview) return
    const incomingCode = new URLSearchParams(window.location.search).get('ref')
    if (incomingCode && /^[0-9A-Za-z]{10}$/.test(incomingCode)) window.localStorage.setItem(referralStorageKey, incomingCode.toUpperCase())
  }, [isPreview, referralStorageKey])

  const canInvite = !isPreview && Boolean(storeData?.business?.referralEnabled) && session?.user?.role === 'customer'
  useEffect(() => {
    if (!canInvite) { setReferralCode(''); return }
    let isCurrent = true
    apiRequest(`/public/businesses/${encodeURIComponent(slug)}/referral-code`, { token: session.token })
      .then((result) => { if (isCurrent) setReferralCode(result.code || '') })
      .catch(() => { if (isCurrent) setReferralCode('') })
    return () => { isCurrent = false }
  }, [canInvite, slug, session?.token])

  async function copyReferralLink() {
    const link = `${window.location.origin}/local/${slug}?ref=${referralCode}`
    try {
      await navigator.clipboard.writeText(link)
      setReferralCopied(true)
      window.setTimeout(() => setReferralCopied(false), 2500)
    } catch { window.prompt('Copiá tu link de invitación:', link) }
  }

  useEffect(() => {
    if (isPreview && previewData) {
      setStoreData(previewData)
      setError('')
      return
    }
    let isCurrent = true
    apiRequest(`/public/businesses/${encodeURIComponent(slug)}`)
      .then((result) => { if (isCurrent) setStoreData(result) })
      .catch((requestError) => { if (isCurrent) setError(requestError.message) })
    return () => { isCurrent = false }
  }, [isPreview, previewData, slug])

  const business = storeData?.business
  const products = storeData?.products || []
  const categoryAddons = storeData?.addons || []
  const rewards = storeData?.rewards || []
  const bestSellerIds = new Set(storeData?.bestSellerIds || [])
  const bestSellers = products.filter((product) => bestSellerIds.has(product.id))
  const categoryNames = [...new Set(products.map((product) => product.category))]
  const deliveryEnabled = business?.deliveryEnabled !== false
  const addonsEnabled = business?.addonsEnabled !== false
  const currentTab = categoryNames.includes(activeCategory) ? activeCategory : categoryNames[0]
  const visibleProducts = products.filter((product) => product.category === currentTab)
  const orderedBestSellers = [...bestSellers].sort((a, b) => (storeData.bestSellerIds.indexOf(a.id) - storeData.bestSellerIds.indexOf(b.id)))

  function renderProduct(product) {
    const productAddons = addonsEnabled ? categoryAddons.filter((addon) => addon.category === product.category) : []
    const productCartItems = cart.filter((item) => String(item.id) === String(product.id))
    const productCartCount = productCartItems.reduce((sum, item) => sum + item.quantity, 0)
    const cartItem = productCartItems.find((item) => !(item.selectedAddOns || []).length)
    return <article className={styles.product} key={product.id}>
      {product.imageDataUrl ? <div className={styles.productImageFrame}><img className={styles.productImage} src={product.imageDataUrl} alt={product.name} style={{ '--image-scale': product.imageScale || 1, '--image-position-x': `${product.imagePositionX ?? 50}%`, '--image-position-y': `${product.imagePositionY ?? 50}%` }} /></div> : <div className={styles.productPlaceholder}><Store size={25} /></div>}
      <div className={styles.productInfo}>
        <span className={styles.category}>{product.category}{bestSellerIds.has(product.id) && <em className={styles.bestSellerBadge}><Flame size={11} /> Más vendido</em>}</span><h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className={styles.productBottom}><strong>{currency.format(product.price)}</strong><span><Award size={14} /> +{product.pointsPerUnit * pointsMultiplier} pts</span></div>
        {productAddons.length > 0
          ? <button className={styles.addButton} type="button" disabled={isPreview} onClick={() => openProductCustomizer(product)}>{productCartCount ? `Personalizar · ${productCartCount} en pedido` : 'Personalizar'} <Plus size={15} /></button>
          : cartItem ? <div className={styles.quantity}><button type="button" aria-label={`Quitar una unidad de ${product.name}`} onClick={() => changeQuantity(product, -1)}><Minus size={15} /></button><span>{cartItem.quantity}</span><button type="button" aria-label={`Agregar una unidad de ${product.name}`} onClick={() => changeQuantity(product, 1)}><Plus size={15} /></button></div> : <button className={styles.addButton} type="button" disabled={isPreview} onClick={() => changeQuantity(product, 1)}>Agregar <Plus size={15} /></button>}
      </div>
    </article>
  }
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const selectedReward = rewards.find((reward) => String(reward.id) === String(selectedRewardId))
  const selectedDiscountReward = selectedReward?.rewardType === 'discount' ? selectedReward : null
  const selectedProductReward = selectedReward?.rewardType === 'product' && selectedReward.productId ? selectedReward : null
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0) + (selectedProductReward ? 1 : 0)
  const discountAmount = selectedDiscountReward
    ? selectedDiscountReward.discountType === 'percentage'
      ? Math.round(cartTotal * Number(selectedDiscountReward.discountValue) / 100)
      : Math.min(cartTotal, Number(selectedDiscountReward.discountValue))
    : 0
  const finalTotal = cartTotal - discountAmount
  const pointsMultiplier = business?.bonusPointsActiveToday ? 2 : 1
  const sortedRewardCosts = [...rewards].map((reward) => reward.pointsCost).sort((a, b) => a - b)
  const userPoints = isPreview ? Math.round((sortedRewardCosts[0] || 100) / 2) : Number(session?.user?.points || 0)
  const nextReward = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost).find((reward) => reward.pointsCost > userPoints)
  const pointsTotal = cart.reduce((sum, item) => sum + item.pointsPerUnit * item.quantity, 0) * pointsMultiplier
  useEffect(() => {
    if (business && !deliveryEnabled) setFulfillmentType('pickup')
  }, [business, deliveryEnabled])
  useEffect(() => {
    if (addonsEnabled) return
    setCart((current) => current.map((item) => ({ ...item, price: Number(item.basePrice ?? item.price), selectedAddOns: [] })))
    setCustomizingProduct(null)
    setSelectedAddonIds([])
  }, [addonsEnabled])
  useEffect(() => {
    if (isPreview || !business?.name) return
    const previousTitle = document.title
    document.title = `${business.name} | Dotty`
    return () => { document.title = previousTitle }
  }, [business?.name, isPreview])

  const customizerAddons = addonsEnabled && customizingProduct ? categoryAddons.filter((addon) => addon.category === customizingProduct.category) : []
  const selectedAddonTotal = customizerAddons
    .filter((addon) => selectedAddonIds.includes(String(addon.id)))
    .reduce((sum, addon) => sum + Number(addon.price), 0)

  function changeQuantity(product, amount, addOns = product.selectedAddOns || []) {
    const cartKey = `${product.id}:${addOns.map((addon) => String(addon.id)).sort().join(',')}`
    const addOnTotal = addOns.reduce((sum, addon) => sum + Number(addon.price), 0)
    setCart((current) => {
      const existing = current.find((item) => item.cartKey === cartKey)
      if (!existing && amount > 0) return [...current, { ...product, cartKey, basePrice: Number(product.basePrice ?? product.price), price: Number(product.basePrice ?? product.price) + addOnTotal, selectedAddOns: addOns, quantity: 1 }]
      return current.map((item) => item.cartKey === cartKey
        ? { ...item, quantity: item.quantity + amount }
        : item).filter((item) => item.quantity > 0)
    })
  }

  function openProductCustomizer(product) {
    const addons = categoryAddons.filter((addon) => addon.category === product.category)
    if (!addons.length) {
      changeQuantity(product, 1, [])
      return
    }
    setCustomizingProduct(product)
    setSelectedAddonIds([])
  }

  function addCustomizedProduct() {
    if (!customizingProduct) return
    const addons = customizerAddons.filter((addon) => selectedAddonIds.includes(String(addon.id)))
    changeQuantity(customizingProduct, 1, addons)
    setCustomizingProduct(null)
    setSelectedAddonIds([])
  }

  async function placeOrder() {
    if (isPreview) return
    if (!session?.token || session.user?.role !== 'customer') {
      setIsAuthOpen(true)
      return
    }
    if (!cart.length && !selectedProductReward) return
    if (!fulfillmentType) { setError('Elegí si querés delivery o retirar en el local.'); return }
    if (fulfillmentType === 'delivery' && !deliveryAddress.trim()) { setError('Ingresá la dirección de entrega.'); return }
    const cashPaymentAmount = paymentMethod === 'cash' && cashAmount ? Number(cashAmount) : null
    if (cashPaymentAmount !== null && (!Number.isSafeInteger(cashPaymentAmount) || cashPaymentAmount < finalTotal)) { setError(`El monto con el que pagás debe ser al menos ${currency.format(finalTotal)}.`); return }
    if (!paymentMethod) { setError('Elegí un método de pago.'); return }
    setIsSubmitting(true)
    setError('')
    try {
      const result = await apiRequest('/orders', {
        method: 'POST',
        token: session.token,
        body: {
          businessSlug: business.slug,
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity, addonIds: (item.selectedAddOns || []).map((addon) => addon.id) })),
          discountRewardId: selectedDiscountReward?.id ?? null,
          productRewardId: selectedProductReward?.id ?? null,
          deliveryAddress,
          deliveryReference,
          deliveryLat: coordinates?.lat ?? null,
          deliveryLng: coordinates?.lng ?? null,
          cashPaymentAmount,
          fulfillmentType,
          paymentMethod,
          customerNotes,
          referralCode: window.localStorage.getItem(referralStorageKey) || undefined,
        },
      })
      window.localStorage.removeItem(referralStorageKey)
      if (fulfillmentType === 'delivery') window.localStorage.setItem('sabor-vivo-address', deliveryAddress.trim())
      onAuthenticate({ ...session, user: result.user })
      setCart([])
      setIsCartOpen(false)
      setSelectedRewardId(null)
      setCustomerNotes('')
      setDeliveryReference('')
      setCashAmount('')
      if (business.whatsapp) {
        const phone = business.whatsapp.replace(/\D/g, '')
        const message = buildWhatsappMessage(result.order, result.user, business)
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
      }
    } catch (orderError) { setError(orderError.message) } finally { setIsSubmitting(false) }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setError('Tu navegador no permite obtener la ubicación.'); return }
    setIsLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCoordinates({ lat: Number(coords.latitude.toFixed(6)), lng: Number(coords.longitude.toFixed(6)) }); setIsLocating(false) },
      () => { setError('No pudimos obtener tu ubicación. Revisá el permiso del navegador.'); setIsLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function redeemReward(reward) {
    if (isPreview) return
    if (session?.user?.role !== 'customer') {
      setIsAuthOpen(true)
      return
    }
    if (session.user.points < reward.pointsCost) {
      setError('Todavía no tenés puntos suficientes para este canje.')
      return
    }
    if (reward.rewardType === 'discount' || (reward.rewardType === 'product' && reward.productId)) {
      const isAlreadySelected = String(selectedRewardId) === String(reward.id)
      setError('')
      setSelectedRewardId(isAlreadySelected ? null : reward.id)
      setNotice(isAlreadySelected
        ? 'Se quitó el canje del pedido.'
        : `${reward.rewardType === 'discount' ? 'El descuento' : `El producto ${reward.productName}`} se aplicará al confirmar el pedido y se descontarán ${reward.pointsCost} puntos.`)
      return
    }
    if (!window.confirm(`¿Canjear ${reward.name} por ${reward.pointsCost} puntos?`)) return
    setRedeemingId(reward.id)
    setError('')
    try {
      const result = await apiRequest(`/public/businesses/${encodeURIComponent(business.slug)}/redeem`, {
        method: 'POST', token: session.token, body: { rewardId: reward.id },
      })
      onAuthenticate({ ...session, user: { ...session.user, points: result.points } })
      setNotice(`Solicitaste ${result.redemption.rewardName}. Restan ${result.points} puntos.`)
    } catch (redeemError) { setError(redeemError.message) } finally { setRedeemingId(null) }
  }

  if (error && !business) return <main className={styles.errorPage}><Store size={28} /><h1>Este local no está disponible</h1><p>{error}</p><a href="/">Ir a Dotty</a></main>
  if (!business) return <main className={styles.loading}><LoaderCircle size={22} className={styles.spinner} /> Cargando el local...</main>

  return (
    <div className={styles.page} style={{ ...getBusinessFontVariables(business.fontFamily), '--store-primary': business.primaryColor || '#c95031', '--store-secondary': business.secondaryColor || '#58705e', '--logo-scale': business.logoScale || 1 }}>
      {isPreview && <div className={styles.previewNotice}><span>Vista previa del cliente</span><small>Los pedidos y canjes están desactivados mientras editás.</small></div>}
      {!isPreview && <header className={styles.header}>
        <div className={styles.headerActions}>
          <button className={styles.mobileCartButton} type="button" onClick={() => setIsCartOpen(true)} aria-label={`Abrir carrito, ${cartCount} productos`}>
            <ShoppingBag size={18} /><span>Mi carrito</span><b>{cartCount}</b>
          </button>
          {session?.user?.role === 'customer' && <span className={styles.points}><Award size={16} /> {session.user.points} pts</span>}
          <button className={styles.accountButton} type="button" onClick={() => session ? onSignOut() : setIsAuthOpen(true)}>
            <LogIn size={16} />{session ? 'Salir' : 'Ingresar'}
          </button>
        </div>
      </header>}
      {isCartOpen && <button className={styles.cartBackdrop} type="button" aria-label="Cerrar carrito" onClick={() => setIsCartOpen(false)} />}

      <section className={`${styles.hero} ${business.bannerDataUrl ? styles.heroWithBanner : ''}`}>
        {business.bannerDataUrl && <img className={styles.heroImage} src={business.bannerDataUrl} alt="" />}
        <div className={styles.heroContent}>
          {business.logoDataUrl && <span className={styles.heroLogoFrame}><img src={business.logoDataUrl} alt={`Logo de ${business.name}`} /></span>}
          <h1>{business.name}</h1>
          <p>{business.description || 'Productos hechos para disfrutar.'}</p>
          <div className={styles.details}>
            {business.address && <span><MapPin size={15} /> {business.address}</span>}
            {business.openingHours && <span>{business.openingHours}</span>}
            {business.whatsapp && <a href={`https://wa.me/${business.whatsapp.replace(/\D/g, '')}`}><MessageCircle size={15} /> WhatsApp</a>}
          </div>
        </div>
      </section>
      {business.bonusPointsActiveToday && <div className={styles.bonusNotice}><Award size={16} /><span>Hoy sumás el doble de puntos en todos tus pedidos.</span></div>}
      {(isPreview || session?.user?.role === 'customer') && <section className={styles.pointsCard} aria-label="Tus puntos">
        <div className={styles.pointsTotal}><span>Tus puntos en {business.name}</span><strong>{userPoints}</strong></div>
        {nextReward
          ? <div className={styles.goal}>
            <div className={styles.goalText}><span>Próximo canje: <b>{nextReward.name}</b></span><span>{userPoints} / {nextReward.pointsCost} pts</span></div>
            <div className={styles.goalBar} role="progressbar" aria-valuemin={0} aria-valuemax={nextReward.pointsCost} aria-valuenow={userPoints}><span style={{ width: `${Math.min(100, userPoints / nextReward.pointsCost * 100)}%` }} /></div>
            <small>Te faltan {nextReward.pointsCost - userPoints} puntos</small>
          </div>
          : rewards.length > 0 && <div className={styles.goal}><div className={styles.goalText}><span>¡Ya podés canjear cualquier recompensa!</span></div><div className={styles.goalBar}><span style={{ width: '100%' }} /></div></div>}
      </section>}

      {business.referralEnabled && Number(business.referralPoints) > 0 && <section className={styles.referralBanner} aria-label="Invitá a un amigo">
        <Gift size={30} />
        <div><strong>¡Invitá a un amigo y sumá {business.referralPoints} puntos!</strong><span>Cuando tu amigo haga su primera compra en {business.name}, los puntos son tuyos.</span></div>
        {!isPreview && <button type="button" onClick={() => (referralCode ? copyReferralLink() : setIsAuthOpen(true))}>{referralCode ? (referralCopied ? 'Link copiado ✓' : 'Copiar mi link') : 'Quiero mi link'}</button>}
      </section>}

      <main className={styles.main}>
        <div className={styles.catalog}>
          {products.length === 0 && <p className={styles.empty}>Este local todavía está preparando su menú.</p>}
          {bestSellers.length > 0 && <section className={styles.bestSellersSection} aria-label="Más vendidos">
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Los favoritos</span><h2>Más vendidos</h2></div></div>
            <div className={styles.productGrid}>{orderedBestSellers.map(renderProduct)}</div>
          </section>}
          {products.length > 0 && <>
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>El menú</span><h2>Productos</h2></div><span>{visibleProducts.length} opciones</span></div>
            <nav className={styles.categoryTabs} aria-label="Categorías">
              {categoryNames.map((name) => <button type="button" key={name} className={currentTab === name ? styles.categoryTabActive : ''} aria-pressed={currentTab === name} onClick={() => setActiveCategory(name)}>{name}</button>)}
            </nav>
            <div className={styles.productGrid}>{visibleProducts.map(renderProduct)}</div>
          </>}

          <section className={styles.rewardsSection}>
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Club de clientes</span><h2>Canjeá tus puntos</h2></div></div>
            {rewards.length === 0 ? <p className={styles.empty}>Pronto habrá recompensas disponibles.</p> : <div className={styles.rewardGrid}>{rewards.map((reward) => {
              const isRewardSelected = String(selectedRewardId) === String(reward.id)
              return <article className={styles.reward} key={reward.id}>
                {(reward.imageDataUrl || reward.productImageDataUrl) && <img className={styles.rewardImage} src={reward.imageDataUrl || reward.productImageDataUrl} alt="" />}
                {reward.rewardType === 'discount' && <span className={styles.rewardTypeTag}>{reward.discountType === 'percentage' ? `${reward.discountValue}% de descuento` : `${currency.format(reward.discountValue)} de descuento`}</span>}
                {reward.rewardType === 'product' && reward.productId && <span className={styles.rewardTypeTag}>Producto: {reward.productName}</span>}
                <span className={styles.rewardCost}><Award size={15} /> {reward.pointsCost} pts</span><h3>{reward.name}</h3><p>{reward.rewardType === 'product' && reward.productId ? `${reward.productName} · ${currency.format(reward.productPrice)}` : reward.description}</p>
                <button className={styles.redeemButton} type="button" aria-pressed={reward.productId || reward.rewardType === 'discount' ? isRewardSelected : undefined} disabled={isPreview || redeemingId === reward.id} onClick={() => redeemReward(reward)}>
                  {redeemingId === reward.id ? 'Solicitando...' : reward.rewardType === 'discount' || reward.productId ? isRewardSelected ? 'Quitar del pedido' : 'Agregar al pedido' : 'Canjear'}
                </button>
              </article>
            })}</div>}
          </section>
          {!isPreview && business.referralEnabled && <section className={styles.referralSection}>
            <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Invitá amigos</span><h2>Ganá {business.referralPoints} puntos por cada amigo</h2></div></div>
            <p>Compartí tu link: cuando tu amigo haga su primera compra en {business.name}, sumás {business.referralPoints} puntos.</p>
            {referralCode
              ? <div className={styles.referralLink}><input type="text" readOnly value={`${window.location.origin}/local/${slug}?ref=${referralCode}`} onFocus={(event) => event.target.select()} /><button type="button" onClick={copyReferralLink}>{referralCopied ? 'Copiado ✓' : 'Copiar link'}</button></div>
              : <button className={styles.redeemButton} type="button" onClick={() => setIsAuthOpen(true)} hidden={session?.user?.role === 'customer'}>Ingresá para obtener tu link</button>}
          </section>}
        </div>

        <aside className={`${styles.orderPanel} ${isCartOpen ? styles.orderPanelOpen : ''}`}>
          <div className={styles.orderTitle}><ShoppingBag size={19} /><h2>Tu pedido</h2><span>{cartCount}</span><button className={styles.closeCartButton} type="button" aria-label="Cerrar carrito" onClick={() => setIsCartOpen(false)}><X size={19} /></button></div>
          {cart.length === 0 && !selectedProductReward ? <p className={styles.emptyCart}>Agregá productos para armar tu pedido.</p> : <>
            {cart.length > 0 && <ul className={styles.cartList}>{cart.map((item) => <li key={item.cartKey || item.id}><span>{item.quantity} × {item.name}{item.selectedAddOns?.length > 0 && <small>Agregados: {item.selectedAddOns.map((addon) => `${addon.name} (+${currency.format(addon.price)})`).join(', ')}</small>}</span><strong>{currency.format(item.price * item.quantity)}</strong><div className={styles.cartLineQuantity}><button type="button" aria-label={`Quitar una unidad de ${item.name}`} onClick={() => changeQuantity(item, -1)}><Minus size={12} /></button><span>{item.quantity}</span><button type="button" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => changeQuantity(item, 1)}><Plus size={12} /></button></div></li>)}</ul>}
            {selectedProductReward && <div className={styles.productRewardLine}>{selectedProductReward.productImageDataUrl && <img src={selectedProductReward.productImageDataUrl} alt="" />}<span>1 × {selectedProductReward.productName}<small>Canje por {selectedProductReward.pointsCost} puntos</small></span><strong>$0</strong><button type="button" aria-label="Quitar producto de canje" onClick={() => setSelectedRewardId(null)}><X size={13} /></button></div>}
            <div className={styles.total}><span>Subtotal</span><strong>{currency.format(cartTotal)}</strong></div>
            {selectedDiscountReward && <div className={styles.discountLine}><span>{selectedDiscountReward.name}</span><strong>−{currency.format(discountAmount)}</strong><button type="button" aria-label="Quitar descuento" onClick={() => setSelectedRewardId(null)}><X size={13} /></button></div>}
            <div className={styles.total}><span>Total</span><strong>{currency.format(finalTotal)}</strong></div>
            <div className={styles.earned}><Award size={15} /> Sumás {pointsTotal} puntos{business.bonusPointsActiveToday ? ' (dobles hoy)' : ''}</div>
            <div className={styles.checkoutForm}>
              <fieldset><legend>¿Cómo querés recibirlo?</legend>
                {deliveryEnabled && <label className={styles.paymentOption}><input type="radio" name="fulfillment" value="delivery" checked={fulfillmentType === 'delivery'} onChange={() => setFulfillmentType('delivery')} /><span>Envío a domicilio</span></label>}
                <label className={styles.paymentOption}><input type="radio" name="fulfillment" value="pickup" checked={fulfillmentType === 'pickup'} onChange={() => setFulfillmentType('pickup')} /><span>Retiro en el local</span></label>
              </fieldset>
              {fulfillmentType === 'delivery' && <>
                <label><span>Dirección de entrega</span><input type="text" maxLength={200} placeholder="Calle, número, piso/depto" value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setCoordinates(null) }} /></label>
                <button className={styles.locationButton} type="button" onClick={useCurrentLocation} disabled={isLocating}>{isLocating ? 'Buscando ubicación...' : coordinates ? 'Ubicación exacta guardada ✓ (tocá para actualizar)' : 'Compartir mi ubicación exacta (recomendado)'}</button>
                <label><span>Referencia (opcional)</span><input type="text" maxLength={200} placeholder="Entre calles, edificio, no anda el timbre..." value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} /></label>
              </>}
              {fulfillmentType === 'pickup' && business.address && <p className={styles.pickupInfo}>Retirás en: {business.address}</p>}
              <fieldset><legend>Método de pago</legend>
                {Object.entries(paymentLabels).map(([value, label]) => <label className={styles.paymentOption} key={value}><input type="radio" name="payment-method" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} /><span>{label}</span></label>)}
              </fieldset>
              {paymentMethod === 'cash' && <label><span>¿Con cuánto pagás? (opcional, para llevar el vuelto)</span><input type="text" inputMode="numeric" placeholder={`Ej: ${Math.ceil(finalTotal / 1000) * 1000 + 1000}`} value={cashAmount} onChange={(event) => setCashAmount(event.target.value.replace(/\D/g, '').slice(0, 9))} /></label>}
              <label><span>Aclaraciones del pedido (opcional)</span><textarea maxLength={300} rows={2} placeholder="Sin cebolla, cortar en 8..." value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} /></label>
            </div>
          </>}
          {error && <p className={styles.inlineError} role="alert">{error}</p>}
          {notice && <div className={styles.success} role="status"><span>{notice}</span>{orderReceipt && <button className={styles.receiptPrintButton} type="button" onClick={() => window.print()}><Printer size={14} /> Imprimir ticket</button>}</div>}
          <button className={styles.checkout} type="button" disabled={isPreview || (!cart.length && !selectedProductReward) || isSubmitting} onClick={placeOrder}>{isSubmitting ? <LoaderCircle size={17} className={styles.spinner} /> : null}{isPreview ? 'Vista previa' : isSubmitting ? 'Registrando...' : 'Confirmar pedido'}{!isSubmitting && !isPreview && <ArrowRight size={16} />}</button>
        </aside>
      </main>
      {orderReceipt && <section className={styles.printReceipt} aria-label={`Ticket del pedido ${orderReceipt.id}`}>
        <header><strong>{business.name}</strong><span>Pedido #{orderReceipt.id}</span>        <time>{formatOrderDate(orderReceipt.createdAt)}</time></header>
                <p>Cliente: {orderReceipt.customerName || 'Cliente'} · {orderReceipt.customerPhone}</p>
                <p>Entrega: {fulfillmentLabel(orderReceipt)}</p>
                <p>Pago: {paymentLabels[orderReceipt.paymentMethod]}</p>
                {orderReceipt.customerNotes && <p>Aclaraciones: {orderReceipt.customerNotes}</p>}
        <ul>{orderReceipt.items.map((item, index) => <li key={`${item.id}-${index}`}>
          <span>{item.quantity} × {item.name}{item.addOns?.length > 0 && <small>Agregados: {item.addOns.map((addon) => `${addon.name} (+${currency.format(addon.price)})`).join(', ')}</small>}{item.isReward && <small>Canje por {item.pointsSpent} puntos</small>}</span>
          <strong>{currency.format(item.unitPrice * item.quantity)}</strong>
        </li>)}</ul>
        <div className={styles.receiptAmount}><span>Subtotal</span><strong>{currency.format(orderReceipt.subtotal)}</strong></div>
        {orderReceipt.discountAmount > 0 && <div className={styles.receiptAmount}><span>Descuento · {orderReceipt.discountName} ({orderReceipt.discountPointsSpent} pts)</span><strong>−{currency.format(orderReceipt.discountAmount)}</strong></div>}
        <div className={`${styles.receiptAmount} ${styles.receiptGrandTotal}`}><span>Total</span><strong>{currency.format(orderReceipt.total)}</strong></div>
        <p>Puntos sumados: {orderReceipt.pointsEarned}</p>
      </section>}
      {customizingProduct && <div className={styles.customizerBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCustomizingProduct(null)}>
        <section className={styles.customizerDialog} role="dialog" aria-modal="true" aria-labelledby="customizer-title">
          <header><div><span className={styles.eyebrow}>{customizingProduct.category}</span><h2 id="customizer-title">Personalizá tu {customizingProduct.name}</h2><p>Elegí los agregados que quieras.</p></div><button className={styles.customizerClose} type="button" aria-label="Cerrar" onClick={() => setCustomizingProduct(null)}><X size={18} /></button></header>
          <div className={styles.addonChoices}>{customizerAddons.map((addon) => {
            const selected = selectedAddonIds.includes(String(addon.id))
            return <label className={`${styles.addonChoice} ${selected ? styles.addonChoiceSelected : ''}`} key={addon.id}>
              <input type="checkbox" checked={selected} onChange={() => setSelectedAddonIds((current) => selected ? current.filter((id) => id !== String(addon.id)) : [...current, String(addon.id)])} />
              <span>{addon.name}</span><strong>{addon.price ? `+${currency.format(addon.price)}` : 'Sin cargo'}</strong>
            </label>
          })}</div>
          <div className={styles.customizerTotal}><span>Precio de tu {customizingProduct.name}</span><strong>{currency.format(Number(customizingProduct.price) + selectedAddonTotal)}</strong></div>
          <footer><button className={styles.customizerCancel} type="button" onClick={() => setCustomizingProduct(null)}>Cancelar</button><button className={styles.addButton} type="button" onClick={addCustomizedProduct}>Agregar al pedido <Plus size={15} /></button></footer>
        </section>
      </div>}
      {isAuthOpen && <AuthModal user={session?.user} businessSlug={business?.slug} onAuthenticate={(nextSession) => { onAuthenticate(nextSession); setIsAuthOpen(false) }} onClose={() => setIsAuthOpen(false)} onSignOut={onSignOut} />}
    </div>
  )
}

export default LocalStorefront
