import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import styles from './PushNotifications.module.css'

function decodeKey(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export default function PushNotifications({ slug, token, orderId }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = `/public/businesses/${encodeURIComponent(slug)}/push`

  useEffect(() => {
    setStatus(null)
    setError('')
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    let active = true
    async function load() {
      try {
        const registration = await navigator.serviceWorker.register('/push-sw.js')
        const subscription = await registration.pushManager.getSubscription()
        const result = await apiRequest(`${path}/status`, { token, body: { endpoint: subscription?.endpoint || '' } })
        if (active) setStatus(result)
      } catch (requestError) {
        if (active) setError(`No pudimos consultar las notificaciones: ${requestError.message}`)
      }
    }
    load()
    return () => { active = false }
  }, [path, token, orderId])

  async function enable() {
    setBusy(true)
    setError('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('El navegador no permitió las notificaciones. Podés cambiarlo en sus ajustes.')
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const currentKey = subscription.options.applicationServerKey
        const expected = decodeKey(status.publicKey)
        if (currentKey && (new Uint8Array(currentKey).length !== expected.length
          || new Uint8Array(currentKey).some((byte, index) => byte !== expected[index]))) {
          throw new Error('La configuración de notificaciones cambió. Borrá los datos de este sitio en el navegador y volvé a activarlas.')
        }
      } else {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(status.publicKey) })
      }
      await apiRequest(`${path}/subscribe`, { token, body: { subscription: subscription.toJSON() } })
      setStatus((current) => ({ ...current, subscribed: true }))
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true)
    setError('')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await apiRequest(`${path}/unsubscribe`, { token, body: { endpoint: subscription.endpoint } })
      setStatus((current) => ({ ...current, subscribed: false }))
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  if (!error && (!status?.enabled || (!status.eligible && !status.subscribed))) return null
  return <section className={styles.notifications} aria-label="Notificaciones del local">
    {status?.enabled && (status.eligible || status.subscribed) && <>
      <div>
        <strong>{status.subscribed ? 'Notificaciones activadas' : '¿Querés enterarte de los nuevos canjes y ofertas de este local?'}</strong>
        <p>{status.subscribed ? 'Te avisaremos sobre nuevos canjes y cambios en puntos dobles.' : 'Recibí novedades en este dispositivo. Podés desactivarlas cuando quieras.'}</p>
      </div>
      <button type="button" disabled={busy} onClick={status.subscribed ? disable : enable}>
        {busy ? 'Guardando...' : status.subscribed ? 'Desactivar' : 'Activar notificaciones'}
      </button>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>
}
