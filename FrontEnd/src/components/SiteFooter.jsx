import { UtensilsCrossed } from 'lucide-react'
import styles from './SiteFooter.module.css'

function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span className={styles.mark}><UtensilsCrossed size={15} /></span>
      <span>Tu tienda online, con Dotty.</span>
      <a href="#inicio">Volver arriba ↑</a>
    </footer>
  )
}

export default SiteFooter
