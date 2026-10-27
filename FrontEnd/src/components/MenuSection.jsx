import { Plus, Star } from 'lucide-react'
import { currency, menuCategories, menuItems } from '../data/menu.js'
import styles from './MenuSection.module.css'

function MenuSection({ activeCategory, onAddToCart, onCategoryChange }) {
  const visibleItems = activeCategory === 'Todos'
    ? menuItems
    : menuItems.filter((item) => item.category === activeCategory)

  return (
    <section className={styles.section} id="menu" aria-labelledby="menu-title">
      <div className={styles.heading}>
        <div><span className={styles.kicker}>Hecho en nuestra cocina</span><h2 id="menu-title">Nuestro menú</h2></div>
        <p>Elegí tus favoritos y agregalos al carrito.</p>
      </div>
      <div className={styles.popularHeading}><Star size={16} fill="currentColor" /><h3>Los más pedidos</h3></div>
      <div className={styles.categories} role="tablist" aria-label="Categorías del menú">
        {menuCategories.map((category) => (
          <button
            className={`${styles.category} ${activeCategory === category ? styles.selected : ''}`}
            type="button"
            role="tab"
            aria-selected={activeCategory === category}
            key={category}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {visibleItems.map((item) => (
          <article className={styles.card} key={item.id}>
            <div className={styles.imageWrap}>
              <img src={item.image} alt={item.name} loading="lazy" />
              <span className={styles.tag}>{item.tag}</span>
            </div>
            <div className={styles.info}>
              <span className={styles.categoryName}>{item.category}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className={styles.bottom}>
                <div className={styles.price}><strong>{currency.format(item.price)}</strong>{item.oldPrice && <del>{currency.format(item.oldPrice)}</del>}</div>
                <button className={styles.addButton} type="button" aria-label={`Agregar ${item.name}`} onClick={() => onAddToCart(item)}>
                  <span>Agregar</span><Plus size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default MenuSection