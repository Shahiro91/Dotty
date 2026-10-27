import { ArrowRight, Sparkles } from 'lucide-react'
import styles from './PromotionsSection.module.css'

const promotions = [
  { title: '2x1 en hamburguesas', description: 'Llevando 2 hamburguesas, la segunda con 50% de descuento.' },
  { title: '10% off sobre $15.000', description: 'Superando los $15.000, 10% de descuento en el total.' },
  { title: 'Happy Hour Empanadas', description: 'De lunes a viernes, de 16 a 19 h.' },
]

function PromotionsSection() {
  return (
    <section className={styles.section} aria-labelledby="offers-title">
      <div className={styles.heading}>
        <div><span className={styles.kicker}>Para disfrutar hoy</span><h2 id="offers-title">Promos de la casa</h2></div>
        <a href="#menu" className={styles.link}>Ver menú <ArrowRight size={16} /></a>
      </div>
      <div className={styles.list}>
        {promotions.map((promotion) => (
          <article className={styles.card} key={promotion.title}>
            <Sparkles size={19} />
            <div><h3>{promotion.title}</h3><p>{promotion.description}</p></div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default PromotionsSection