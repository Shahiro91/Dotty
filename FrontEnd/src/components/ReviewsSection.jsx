import { BadgeCheck, Star } from 'lucide-react'
import styles from './ReviewsSection.module.css'

const reviews = [
  { name: 'María G.', initial: 'M', quote: 'Las empanadas son las mejores del barrio, siempre pedimos los domingos.' },
  { name: 'Lucas P.', initial: 'L', quote: 'La hamburguesa BBQ es espectacular, llegó caliente y rápido.' },
  { name: 'Carolina R.', initial: 'C', quote: 'Muy rica la milanesa, el puré casero vale la pena.' },
]

function ReviewsSection() {
  return (
    <section className={styles.section} aria-labelledby="reviews-title">
      <div className={styles.heading}>
        <span className={styles.kicker}>Lo cuentan nuestros clientes</span>
        <h2 id="reviews-title">Opiniones de clientes</h2>
      </div>
      <div className={styles.list}>
        {reviews.map((review) => (
          <article className={styles.review} key={review.name}>
            <div className={styles.avatar}>{review.initial}</div>
            <div className={styles.body}>
              <div className={styles.meta}>
                <div><strong>{review.name}</strong><div className={styles.stars} aria-label="5 de 5 estrellas">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={13} fill="currentColor" />)}</div></div>
                <span className={styles.verified}><BadgeCheck size={12} /> Verificada</span>
              </div>
              <blockquote>“{review.quote}”</blockquote>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default ReviewsSection