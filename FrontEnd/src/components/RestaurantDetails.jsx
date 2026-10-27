import { Clock3, MapPin, MessageCircle } from 'lucide-react'
import styles from './RestaurantDetails.module.css'

const details = [
  { icon: MapPin, label: 'Dirección', value: 'Av. Corrientes 1234, Buenos Aires' },
  { icon: Clock3, label: 'Horarios', value: 'Lun a Dom: 11:00 – 23:00' },
  { icon: MessageCircle, label: 'WhatsApp', value: '+54 9 11 0000 0000' },
]

function RestaurantDetails() {
  return (
    <section className={styles.details} aria-label="Información del local">
      {details.map(({ icon: Icon, label, value }) => (
        <div className={styles.item} key={label}>
          <Icon size={20} />
          <div><strong>{label}</strong><span>{value}</span></div>
        </div>
      ))}
    </section>
  )
}

export default RestaurantDetails