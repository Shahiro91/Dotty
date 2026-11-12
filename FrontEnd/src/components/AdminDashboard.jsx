import { useEffect, useState } from 'react'
import { Ban, Check, ClipboardList, LoaderCircle, LogOut, Phone, Trash2 } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import styles from './AdminDashboard.module.css'

const planLabels = { basic: 'Básico', vip: 'VIP' }

function AdminDashboard({ token, onSignOut }) {
  const [applications, setApplications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('businesses')
  const [messages, setMessages] = useState([])

  useEffect(() => {
    apiRequest('/admin/support', { token }).then((result) => setMessages(result.messages)).catch(() => {})
  }, [token])

  async function toggleResolved(item) {
    try {
      const result = await apiRequest(`/admin/support/${item.id}`, { method: 'PATCH', token, body: { resolved: !item.resolved } })
      setMessages((current) => current.map((message) => message.id === item.id ? result.message : message))
    } catch (requestError) { setError(requestError.message) }
  }

  async function deleteMessage(item) {
    if (!window.confirm('¿Eliminar este mensaje?')) return
    try {
      await apiRequest(`/admin/support/${item.id}`, { method: 'DELETE', token })
      setMessages((current) => current.filter((message) => message.id !== item.id))
    } catch (requestError) { setError(requestError.message) }
  }

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setError('')
    apiRequest('/admin/local-applications?status=approved', { token })
      .then((result) => {
        if (isCurrent) setApplications(result.applications)
      })
      .catch((requestError) => {
        if (isCurrent) setError(requestError.message)
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [token])

  async function updateSubscription(application, action) {
    if (action === 'suspend' && !window.confirm(`¿Suspender ahora a ${application.businessName}? No podrán usar la cuenta hasta que paguen o la extiendas.`)) return
    setBusyId(application.id)
    setError('')
    try {
      const result = await apiRequest(`/admin/businesses/${application.businessId}/subscription`, { method: 'POST', token, body: { action } })
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, billing: result.billing } : item))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId(null)
    }
  }

  async function deleteBusiness(application) {
    if (!window.confirm(`¿Eliminar definitivamente a ${application.businessName}? Se borrarán su tienda, productos y configuración. Los pedidos históricos se conservarán sin asociarse al local. Esta acción no se puede deshacer.`)) return
    setBusyId(application.id)
    setError('')
    try {
      await apiRequest(`/admin/businesses/${application.businessId}`, { method: 'DELETE', token })
      setApplications((current) => current.filter((item) => item.id !== application.id))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className={styles.backdrop} aria-labelledby="admin-title">
      <section className={styles.dialog}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.mark}><ClipboardList size={19} /></span>
            <div>
              <span className={styles.kicker}>Dotty</span>
              <h2 id="admin-title">Administración</h2>
            </div>
          </div>
          <button className={styles.closeButton} type="button" onClick={onSignOut}><LogOut size={17} /> Cerrar sesión</button>
        </header>

        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.tabs}>
          <button type="button" className={tab === 'businesses' ? styles.tabActive : ''} onClick={() => setTab('businesses')}>Locales</button>
          <button type="button" className={tab === 'support' ? styles.tabActive : ''} onClick={() => setTab('support')}>Dudas y sugerencias{messages.some((item) => !item.resolved) && <span className={styles.tabCount}>{messages.filter((item) => !item.resolved).length}</span>}</button>
        </div>
        {tab === 'support' ? (
          messages.length === 0 ? <p className={styles.empty}>Todavía no hay mensajes.</p> : <div className={styles.list}>
            {messages.map((item) => (
              <article className={styles.application} key={item.id} style={item.resolved ? { opacity: 0.55 } : undefined}>
                <div className={styles.business}>
                  <div className={styles.businessHeading}>
                    <h3>{item.businessName}</h3>
                    <span className={styles.status}>{{ question: 'Duda', suggestion: 'Sugerencia', contact: 'Contacto' }[item.kind]}</span>
                  </div>
                  <p>{item.senderName} {item.senderContact && `· ${item.senderContact}`}</p>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{item.message}</p>
                  <time dateTime={item.createdAt}>{new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.approveButton} onClick={() => toggleResolved(item)}><Check size={15} /> {item.resolved ? 'Reabrir' : 'Resuelto'}</button>
                  <button type="button" className={styles.rejectButton} aria-label="Eliminar mensaje" onClick={() => deleteMessage(item)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : isLoading ? (
          <div className={styles.loading}><LoaderCircle className={styles.spinner} size={20} /> Cargando locales activos...</div>
        ) : applications.length === 0 ? (
          <p className={styles.empty}>Todavía no hay locales activos.</p>
        ) : (
          <div className={styles.list}>
            {applications.map((application) => (
              <article className={styles.application} key={application.id}>
                <div className={styles.business}>
                  <div className={styles.businessHeading}>
                    <h3>{application.businessName}</h3>
                    <span className={`${styles.status} ${styles[`status_${application.status}`]}`}>{application.claimed ? 'Activo' : 'Pendiente de ingreso'}</span>
                    <span className={`${styles.plan} ${application.requestedPlan === 'vip' ? styles.planVip : styles.planBasic}`}>{planLabels[application.requestedPlan] || 'Básico'}</span>
                  </div>
                  <p>{application.firstName} {application.lastName}</p>
                  {application.email && <p>{application.email}</p>}
                  <a className={styles.phone} href={`tel:${application.phone}`}><Phone size={14} /> {application.phone}</a>
                  <time dateTime={application.createdAt}>{new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(application.createdAt))}</time>
                </div>
                {!application.claimed && (
                  <div className={styles.actions}>
                    <span className={`${styles.status} ${styles.status_contacted}`}>Debe ingresar con su contraseña</span>
                  </div>
                )}
                {application.billing && (
                  <div className={styles.actions}>
                    <span className={`${styles.status} ${application.billing.status === 'active' ? styles.status_approved : application.billing.status === 'grace' ? styles.status_contacted : styles.status_rejected}`}>
                      {application.billing.status === 'active' ? 'Al día' : application.billing.status === 'grace' ? 'Con plazo para pagar' : 'Suspendido'} · vence {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(application.billing.dueAt))}
                    </span>
                    <button type="button" className={styles.approveButton} disabled={busyId === application.id} onClick={() => updateSubscription(application, 'extend')}><Check size={15} /> Extender 1 mes</button>
                    {application.billing.status !== 'suspended' && <button type="button" className={styles.rejectButton} aria-label={`Suspender ${application.businessName}`} title="Suspender ahora" disabled={busyId === application.id} onClick={() => updateSubscription(application, 'suspend')}><Ban size={16} /></button>}
                    <button type="button" className={styles.rejectButton} aria-label={`Eliminar ${application.businessName}`} title="Eliminar local definitivamente" disabled={busyId === application.id} onClick={() => deleteBusiness(application)}><Trash2 size={16} /></button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <p className={styles.note}>Los locales nuevos se activan al registrarse y tienen 30 días gratis.</p>
      </section>
    </main>
  )
}

export default AdminDashboard
