import { Sparkles } from 'lucide-react'
import styles from './RewardsBanner.module.css'

function RewardsBanner({ points }) {
  return (
    <section className={styles.banner} aria-label="Club Dotty">
      <div className={styles.icon}><Sparkles size={21} /></div>
      <div className={styles.copy}>
        <span className={styles.kicker}>Club Dotty</span>
        <h2>Cada pedido te acerca a algo rico.</h2>
        <p>{points === undefined ? 'Ingresá para guardar tus puntos.' : `Tenés ${points} puntos. Sumás 1 por cada $1.000.`}</p>
      </div>
      <div className={styles.stamp}><span>{points === undefined ? 'Tu compra' : 'Tu saldo'}</span><strong>{points === undefined ? '+ puntos' : `${points} puntos`}</strong></div>
    </section>
  )
}

export default RewardsBanner
