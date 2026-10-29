import { ArrowRight, BarChart3, Check, ClipboardList, FileSpreadsheet, Gift, Link2, Palette, Sparkles, Store, UtensilsCrossed } from 'lucide-react'
import styles from './LandingPage.module.css'

const BRAND_NAME = 'Dotty'

const features = [
  { icon: Link2, title: 'Tu tienda online propia', text: 'Un link con el nombre de tu local para compartir por WhatsApp, Instagram o donde quieras.' },
  { icon: ClipboardList, title: 'Pedidos en un solo lugar', text: 'Un tablero con los pedidos en proceso, enviados y cancelados, con jornadas e historial.' },
  { icon: Gift, title: 'Puntos y canjes', text: 'Tus clientes suman puntos en cada compra y los canjean por productos o descuentos.' },
  { icon: BarChart3, title: 'Estadísticas claras', text: 'Ventas del mes, ticket promedio y los productos y categorías que más se venden.' },
  { icon: FileSpreadsheet, title: 'Carta fácil de armar', text: 'Categorías, agregados y fotos. Con el plan VIP, importá tu carta completa desde Excel.' },
  { icon: Palette, title: 'Con tu estilo', text: 'Elegí tu logo, banner, colores y tipografía para que la tienda se vea como tu marca.' },
]

const steps = [
  { title: 'Dejá tus datos', text: 'Completá el formulario con tu nombre, celular y el nombre de tu local.' },
  { title: 'Te contactamos', text: 'Conversamos con vos, activamos tu local y te damos tu código de acceso.' },
  { title: 'Cargá tu carta y compartí', text: 'Armá tus productos, personalizá tu tienda y mandá tu link a tus clientes.' },
]

const plans = [
  { id: 'basic', name: 'Básico', price: '$15.000', items: ['Tienda online con tu link', 'Tablero de pedidos y clientes', 'Puntos y canjes', 'Estadísticas de ventas'] },
  { id: 'vip', name: 'VIP', price: '$25.000', featured: true, items: ['Todo lo del plan Básico', 'Importación de carta desde Excel', 'Puntos dobles los días que elijas'] },
]

function DashboardMockup() {
  const nav = ['Mi local', 'Productos', 'Canjes', 'Pedidos', 'Clientes', 'Estadísticas']
  const columns = [
    { title: 'En proceso', orders: [{ id: '#1024', who: 'Cliente A', total: '$18.400' }, { id: '#1025', who: 'Cliente B', total: '$9.200' }] },
    { title: 'Enviado', orders: [{ id: '#1023', who: 'Cliente C', total: '$12.800' }] },
  ]
  return (
    <div className={styles.browser} aria-hidden="true">
      <div className={styles.browserBar}><i /><i /><i /><span>tulocal.com/panel</span></div>
      <div className={styles.dash}>
        <aside className={styles.dashSide}>
          <b><span className={styles.dot} /> Tu Local</b>
          {nav.map((item, index) => <span key={item} className={index === 3 ? styles.dashActive : ''}>{item}</span>)}
        </aside>
        <div className={styles.dashMain}>
          <div className={styles.dashTitle}>Pedidos</div>
          <div className={styles.dashStats}>
            <div><small>Ventas del mes</small><strong>$482.300</strong></div>
            <div><small>Pedidos</small><strong>57</strong></div>
            <div><small>Ticket promedio</small><strong>$8.460</strong></div>
          </div>
          <div className={styles.dashColumns}>
            {columns.map((column) => (
              <div key={column.title}>
                <small>{column.title}</small>
                {column.orders.map((order) => <div className={styles.orderCard} key={order.id}><span>{order.id} · {order.who}</span><b>{order.total}</b></div>)}
              </div>
            ))}
          </div>
          <div className={styles.dashBars}>{[38, 52, 44, 70, 58, 86, 64].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
        </div>
      </div>
    </div>
  )
}

function StorefrontMockup() {
  const photo = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=80`
  const products = [
    { name: 'Plato del día', price: '$9.800', image: photo('1604908176997-125f25cc6f3d') },
    { name: 'Pizza napolitana', price: '$14.500', image: photo('1579751626657-72bc17010498') },
    { name: 'Doble smash', price: '$11.500', image: photo('1568901346375-23c9450c58cd') },
    { name: 'Postre de frutilla', price: '$3.500', image: photo('1488477181946-6428a0291777') },
  ]
  return (
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.phoneNotch} />
      <div className={styles.shopBanner} style={{ backgroundImage: `linear-gradient(180deg, rgba(30, 18, 10, .05), rgba(30, 18, 10, .75)), url(${photo('1565299624946-b28f40a0ae38').replace('w=400', 'w=700')})` }}><span><Store size={14} /> Tu Local</span><small>Comida casera · Abierto hoy</small></div>
      <div className={styles.shopPoints}><Sparkles size={13} /> Sumá puntos con cada pedido</div>
      <div className={styles.shopGrid}>
        {products.map((product) => (
          <div className={styles.shopCard} key={product.name}>
            <img src={product.image} alt="" loading="lazy" />
            <b>{product.name}</b>
            <small>{product.price}</small>
          </div>
        ))}
      </div>
      <div className={styles.shopCart}>Ver mi pedido <b>$14.700</b></div>
    </div>
  )
}

function LandingPage({ onLogin, onRegister }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label={`${BRAND_NAME}, inicio`}>
          <span className={styles.brandMark}><UtensilsCrossed size={17} /></span>
          <span>{BRAND_NAME}</span>
        </a>
        <nav className={styles.nav} aria-label="Secciones">
          <a href="#funciones">Funciones</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#planes">Planes</a>
        </nav>
        <div className={styles.headerActions}>
          <button className={styles.ghostButton} type="button" onClick={onLogin}>Ingresar</button>
          <button className={styles.headerCta} type="button" onClick={onRegister}>Registrar mi local</button>
        </div>
      </header>

      <main id="inicio">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Sparkles size={14} /> Para locales gastronómicos</span>
            <h1>Vendé online y hacé que tus clientes vuelvan.</h1>
            <p>Creá tu tienda online, recibí pedidos y premiá a tus clientes con puntos. Todo desde un panel simple y con una suscripción mensual fija.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={onRegister}>Quiero registrar mi local <ArrowRight size={17} /></button>
              <a className={styles.secondaryButton} href="#funciones">Ver cómo funciona</a>
            </div>
            <ul className={styles.heroPoints}>
              <li><Check size={15} /> Sin costos de instalación</li>
              <li><Check size={15} /> Sin instalar nada</li>
              <li><Check size={15} /> Suscripción mensual fija</li>
            </ul>
          </div>
          <div className={styles.heroVisual}>
            <DashboardMockup />
            <StorefrontMockup />
          </div>
        </section>

        <section className={styles.section} id="funciones">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Todo en una plataforma</span>
            <h2>Lo que necesita tu local para vender más</h2>
            <p>Herramientas pensadas para el día a día de un negocio de comida, sin complicaciones técnicas.</p>
          </div>
          <div className={styles.featureGrid}>
            {features.map(({ icon: Icon, title, text }) => (
              <article className={styles.feature} key={title}>
                <span className={styles.featureIcon}><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.showcase}`}>
          <div className={styles.showcaseCopy}>
            <span className={styles.kicker}>Una tienda que fideliza</span>
            <h2>Tus clientes piden fácil y vuelven más seguido</h2>
            <p>Cada local tiene su propia página, con su carta, sus colores y su programa de puntos. El cliente arma su pedido en pocos toques y lo envía directo a tu WhatsApp.</p>
            <ul>
              <li><Check size={16} /> Carta con fotos, categorías y agregados</li>
              <li><Check size={16} /> Puntos por cada compra y canjes a tu medida</li>
              <li><Check size={16} /> Pedido listo para enviar por WhatsApp</li>
            </ul>
            <button className={styles.primaryButton} type="button" onClick={onRegister}>Quiero mi tienda <ArrowRight size={17} /></button>
          </div>
          <div className={styles.showcaseVisual}><StorefrontMockup /></div>
        </section>

        <section className={styles.section} id="como-funciona">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Cómo funciona</span>
            <h2>Empezá en tres pasos</h2>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title}><span>{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>
            ))}
          </ol>
        </section>

        <section className={styles.section} id="planes">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Planes</span>
            <h2>Un precio simple por mes</h2>
            <p>Abonás desde el alta de tu local. Sin costos de instalación.</p>
          </div>
          <div className={styles.plans}>
            {plans.map((plan) => (
              <article className={`${styles.plan} ${plan.featured ? styles.planFeatured : ''}`} key={plan.id}>
                {plan.featured && <span className={styles.planBadge}>Más completo</span>}
                <h3>Plan {plan.name}</h3>
                <p className={styles.price}><strong>{plan.price}</strong> / mes</p>
                <ul>{plan.items.map((item) => <li key={item}><Check size={15} /> {item}</li>)}</ul>
                <button className={plan.featured ? styles.primaryButton : styles.outlineButton} type="button" onClick={onRegister}>Elegir plan {plan.name}</button>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <h2>¿Listo para llevar tu local a internet?</h2>
          <p>Dejanos tus datos y te contactamos para activar tu tienda.</p>
          <button className={styles.ctaButton} type="button" onClick={onRegister}>Quiero registrar mi local <ArrowRight size={17} /></button>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.brandMark}><UtensilsCrossed size={15} /></span>
        <span>{BRAND_NAME} · Tiendas online para locales gastronómicos.</span>
        <button type="button" onClick={onLogin}>Ingresar</button>
      </footer>
    </div>
  )
}

export default LandingPage
