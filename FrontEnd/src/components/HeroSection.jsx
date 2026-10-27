import { MessageCircle, Sparkles, UtensilsCrossed } from 'lucide-react'
import styles from './HeroSection.module.css'

function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.content}>
        <p className={styles.eyebrow}><Sparkles size={14} /> Comida casera hecha con amor</p>
        <h1 id="hero-title">Dotty</h1>
        <p className={styles.description}>Sabor casero, hecho en el día. Pedí online y retiralo o recibilo en casa.</p>
        <div className={styles.actions}>
          <a className={styles.primaryButton} href="#menu"><UtensilsCrossed size={17} /> Ver menú y pedir</a>
          <a className={styles.whatsappButton} href="https://wa.me/5491100000000" target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a>
        </div>
      </div>
      <div className={styles.openNote}><span /> Abierto hoy · 11:00 a 23:00</div>
    </section>
  )
}

export default HeroSection
