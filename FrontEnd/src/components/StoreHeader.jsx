import { Bookmark, Share2, ShoppingBag, UserRound, UtensilsCrossed } from 'lucide-react'
import styles from './StoreHeader.module.css'

function StoreHeader({ cartCount, isSaved, user, onAccountClick, onCartClick, onShare, onToggleSaved }) {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="#inicio" aria-label="Dotty, inicio">
        <span className={styles.brandMark}><UtensilsCrossed size={17} /></span>
        <span>Dotty</span>
      </a>
      <nav className={styles.actions} aria-label="Acciones del local">
        <button className={styles.accountButton} type="button" onClick={onAccountClick} aria-label={user ? `Mi cuenta, ${user.points} puntos` : 'Ingresar o crear cuenta'}>
          <UserRound size={17} />
          <span>{user ? `${user.points} puntos` : 'Ingresar'}</span>
        </button>
        {user && (
          <>
            <button
              className={`${styles.iconButton} ${isSaved ? styles.active : ''}`}
              type="button"
              aria-label={isSaved ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              onClick={onToggleSaved}
            >
              <Bookmark size={19} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
            <button className={styles.iconButton} type="button" aria-label="Compartir Dotty" onClick={onShare}>
              <Share2 size={19} />
            </button>
            <button className={styles.bagButton} type="button" aria-label={`Abrir pedido, ${cartCount} productos`} onClick={onCartClick}>
              <ShoppingBag size={19} />
              <span>{cartCount}</span>
            </button>
          </>
        )}
      </nav>
    </header>
  )
}

export default StoreHeader
