import { ArrowRight, BarChart3, Check, ClipboardList, FileSpreadsheet, Gift, Link2, Palette, Sparkles, UtensilsCrossed } from 'lucide-react'
import dashboardPreview from '../assets/landing-dashboard.png'
import storefrontPreview from '../assets/landing-store.png'
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
  { title: 'Activación inmediata', text: 'Tu local queda activo al registrarte, con 30 días de prueba gratis.' },
  { title: 'Cargá tu carta y compartí', text: 'Armá tus productos, personalizá tu tienda y mandá tu link a tus clientes.' },
]

const plans = [
  { id: 'basic', name: 'Básico', price: '$15.000', items: ['Tienda online con tu link', 'Tablero de pedidos y clientes', 'Puntos y canjes', 'Estadísticas de ventas'] },
  { id: 'vip', name: 'VIP', price: '$25.000', items: ['Todo lo del plan Básico', 'Importación de carta desde Excel', 'Puntos dobles los días que elijas'] },
  { id: 'vip_plus', name: 'VIP PLUS', price: '$35.000', featured: true, items: ['Todo lo del plan VIP', 'Notificaciones personalizadas para clientes con notificaciones activadas'] },
]

function DashboardMockup() {
  return (
    <div className={styles.browser} aria-hidden="true">
      <div className={styles.browserBar}><i /><i /><i /><span>Panel del local</span></div>
      <img className={styles.dashboardPreview} src={dashboardPreview} alt="" />
    </div>
  )
}

function StorefrontMockup() {
  return (
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.phoneNotch} />
      <img className={styles.storefrontPreview} src={storefrontPreview} alt="" />
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
          <button className={styles.headerCta} type="button" onClick={() => onRegister()}>Registrar mi local</button>
        </div>
      </header>

      <main id="inicio">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Sparkles size={14} /> Para locales gastronómicos</span>
            <h1>Vendé online y hacé que tus clientes vuelvan.</h1>
            <p>Creá tu tienda online, recibí pedidos y premiá a tus clientes con puntos. Todo desde un panel simple y con una suscripción mensual fija.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={() => onRegister()}>Quiero registrar mi local <ArrowRight size={17} /></button>
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
            <button className={styles.primaryButton} type="button" onClick={() => onRegister()}>Quiero mi tienda <ArrowRight size={17} /></button>
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
            <p>Probá 30 días gratis. Después, abonás el plan que elijas, sin costos de instalación.</p>
          </div>
          <div className={styles.plans}>
            {plans.map((plan) => (
              <article className={`${styles.plan} ${plan.featured ? styles.planFeatured : ''}`} key={plan.id}>
                {plan.featured && <span className={styles.planBadge}>Más completo</span>}
                <h3>Plan {plan.name}</h3>
                <p className={styles.price}><strong>{plan.price}</strong> / mes</p>
                <ul>{plan.items.map((item) => <li key={item}><Check size={15} /> {item}</li>)}</ul>
                <button className={plan.featured ? styles.primaryButton : styles.outlineButton} type="button" onClick={() => onRegister(plan.id)}>Elegir plan {plan.name}</button>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <h2>¿Listo para llevar tu local a internet?</h2>
          <p>Registrate y activá tu tienda al instante, con 30 días gratis.</p>
          <button className={styles.ctaButton} type="button" onClick={() => onRegister()}>Quiero registrar mi local <ArrowRight size={17} /></button>
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
