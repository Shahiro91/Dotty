import { ArrowRight, Check, Minus, Plus, ShoppingBag, Sparkles, X } from 'lucide-react'
import { currency } from '../data/menu.js'
import styles from './OrderPanel.module.css'

function OrderPanel({ cartItems, cartCount, cartTotal, isOpen, notice, isSubmitting, onClose, onOpen, onQuantityChange, onSendOrder }) {
  return (
    <>
      {cartCount > 0 && (
        <button className={styles.floatingOrder} type="button" onClick={onOpen}>
          <span className={styles.floatingBag}><ShoppingBag size={18} /><b>{cartCount}</b></span>
          <span>Ver mi pedido</span><strong>{currency.format(cartTotal)}</strong>
        </button>
      )}
      {notice && <div className={styles.toast} role="status"><Check size={16} /> {notice}</div>}
      {isOpen && (
        <div className={styles.backdrop} role="presentation" onClick={onClose}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.heading}>
              <div><span className={styles.kicker}>Dotty</span><h2 id="cart-title">Tu pedido</h2></div>
              <button className={styles.closeButton} type="button" aria-label="Cerrar pedido" onClick={onClose}><X size={20} /></button>
            </div>
            {cartItems.length === 0 ? (
              <div className={styles.empty}><ShoppingBag size={30} /><p>Tu bolsa está esperando algo rico.</p><button type="button" onClick={onClose}>Explorar menú</button></div>
            ) : (
              <>
                <div className={styles.lines}>
                  {cartItems.map((item) => (
                    <div className={styles.line} key={item.id}>
                      <img src={item.image} alt="" />
                      <div className={styles.lineCopy}><strong>{item.name}</strong><span>{currency.format(item.price)}</span></div>
                      <div className={styles.quantity}>
                        <button type="button" aria-label={`Quitar una unidad de ${item.name}`} onClick={() => onQuantityChange(item.id, -1)}><Minus size={13} /></button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label={`Agregar una unidad de ${item.name}`} onClick={() => onQuantityChange(item.id, 1)}><Plus size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.rewards}><Sparkles size={16} /> Con este pedido sumás <strong>{Math.floor(cartTotal / 1000)} puntos</strong></div>
                <div className={styles.total}><span>Total</span><strong>{currency.format(cartTotal)}</strong></div>
                <button className={styles.checkout} type="button" onClick={onSendOrder} disabled={isSubmitting}>{isSubmitting ? 'Registrando pedido...' : 'Continuar por WhatsApp'} <ArrowRight size={17} /></button>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default OrderPanel
