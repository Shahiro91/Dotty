import { useState } from 'react'
import { Check, Headset, LoaderCircle, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import styles from './SupportButton.module.css'

const kinds = [['question', 'Duda'], ['suggestion', 'Sugerencia'], ['contact', 'Contacto']]

function SupportButton({ token }) {
  const [isOpen, setIsOpen] = useState(false)
  const [kind, setKind] = useState('question')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function close() {
    setIsOpen(false)
    setSent(false)
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setIsSending(true)
    setError('')
    try {
      await apiRequest('/partner/support', { method: 'POST', token, body: { kind, message } })
      setSent(true)
      setMessage('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSending(false)
    }
  }

  return <>
    <button className={styles.trigger} type="button" aria-label="Ayuda, dudas y sugerencias" title="Dudas, sugerencias o contacto" onClick={() => setIsOpen(true)}><Headset size={18} /></button>
    {isOpen && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="support-title" onSubmit={submit}>
        <header><h3 id="support-title">¿En qué te ayudamos?</h3><button type="button" aria-label="Cerrar" onClick={close}><X size={18} /></button></header>
        {sent ? <>
          <p className={styles.success}><Check size={16} /> ¡Gracias! Recibimos tu mensaje y te vamos a responder a la brevedad.</p>
          <button className={styles.submit} type="button" onClick={close}>Cerrar</button>
        </> : <>
          <div className={styles.kinds}>{kinds.map(([value, label]) => <button key={value} type="button" className={kind === value ? styles.kindActive : ''} onClick={() => setKind(value)}>{label}</button>)}</div>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={6} required placeholder="Contanos tu duda, sugerencia o cómo contactarte..." />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={isSending || message.trim().length < 5}>{isSending ? <LoaderCircle size={16} className={styles.spinner} /> : null} Enviar</button>
        </>}
      </form>
    </div>}
  </>
}

export default SupportButton
