import { useEffect, useState } from 'react'
import { Ban, Check, ClipboardList, LoaderCircle, LogOut, Phone, RefreshCw, Trash2 } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import styles from './AdminDashboard.module.css'

const filters = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'contacted', label: 'Contactados' },
  { value: 'all', label: 'Todas' },
]

const statusLabels = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}
const planLabels = { basic: 'Básico', vip: 'VIP' }

function AdminDashboard({ token, onSignOut }) {
  const [section, setSection] = useState('requests')
  const [filter, setFilter] = useState('pending')
  const [applications, setApplications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [error, setError] = useState('')
  const [issuedCode, setIssuedCode] = useState(null)

  useEffect(() => {
    let isCurrent = true
    const status = section === 'active' ? 'approved' : filter === 'all' ? 'requests' : filter
    setIsLoading(true)
    setError('')
    apiRequest(`/admin/local-applications?status=${status}`, { token })
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
  }, [filter, refreshVersion, section, token])

  async function generateCode(application) {
    setBusyId(application.id)
    setError('')
    try {
      const result = await apiRequest(`/admin/local-applications/${application.id}/activation-code`, { method: 'POST', token })
      setIssuedCode({ code: result.activationCode, businessName: application.businessName, phone: application.phone })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId(null)
    }
  }

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

  async function updateStatus(applicationId, status) {
    setBusyId(applicationId)
    setError('')
    try {
      const result = await apiRequest(`/admin/local-applications/${applicationId}`, {
        method: 'PATCH',
        token,
        body: { status },
      })
      if (status === 'approved' && result.activationCode) {
        const approved = applications.find((application) => application.id === applicationId)
        setIssuedCode({ code: result.activationCode, businessName: approved?.businessName || '', phone: approved?.phone || '' })
      }
      setApplications((current) => status === 'approved'
        ? current.filter((application) => application.id !== applicationId)
        : current.map((application) => application.id === applicationId ? result.application : application),
      )
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

        <nav className={styles.sectionTabs} aria-label="Secciones administrativas">
          <button className={`${styles.sectionTab} ${section === 'requests' ? styles.sectionTabActive : ''}`} type="button" aria-current={section === 'requests' ? 'page' : undefined} onClick={() => setSection('requests')}>Solicitudes</button>
          <button className={`${styles.sectionTab} ${section === 'active' ? styles.sectionTabActive : ''}`} type="button" aria-current={section === 'active' ? 'page' : undefined} onClick={() => setSection('active')}>Activos</button>
        </nav>

        {section === 'requests' && <nav className={styles.filters} aria-label="Filtrar solicitudes">
          {filters.map((item) => (
            <button
              key={item.value}
              className={`${styles.filterButton} ${filter === item.value ? styles.filterActive : ''}`}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button className={styles.refreshButton} type="button" aria-label="Actualizar solicitudes" title="Actualizar" onClick={() => setRefreshVersion((version) => version + 1)}>
            <RefreshCw size={17} />
          </button>
        </nav>}

        {error && <p className={styles.error} role="alert">{error}</p>}
        {issuedCode && (
          <div className={styles.error} role="status" style={{ background: '#edf5ea', color: '#2f5a2c', borderColor: '#bcd8b8' }}>
            <p><strong>Código de activación para {issuedCode.businessName}:</strong></p>
            <p style={{ fontSize: 22, letterSpacing: '0.12em', fontWeight: 800 }}>{issuedCode.code}</p>
            <p>Mandáselo por WhatsApp al {issuedCode.phone}. Se muestra una sola vez y vence en 7 días.</p>
            <button type="button" className={styles.approveButton} onClick={() => navigator.clipboard?.writeText(issuedCode.code)}>Copiar</button>{' '}
            <button type="button" className={styles.contactButton} onClick={() => setIssuedCode(null)}>Cerrar</button>
          </div>
        )}
        {isLoading ? (
          <div className={styles.loading}><LoaderCircle className={styles.spinner} size={20} /> Cargando {section === 'active' ? 'locales activos' : 'solicitudes'}...</div>
        ) : applications.length === 0 ? (
          <p className={styles.empty}>{section === 'active' ? 'Todavía no hay locales activos.' : 'No hay solicitudes en esta vista.'}</p>
        ) : (
          <div className={styles.list}>
            {applications.map((application) => (
              <article className={styles.application} key={application.id}>
                <div className={styles.business}>
                  <div className={styles.businessHeading}>
                    <h3>{application.businessName}</h3>
                    <span className={`${styles.status} ${styles[`status_${application.status}`]}`}>{section === 'active' ? 'Activo' : statusLabels[application.status]}</span>
                    <span className={`${styles.plan} ${application.requestedPlan === 'vip' ? styles.planVip : styles.planBasic}`}>{planLabels[application.requestedPlan] || 'Básico'}</span>
                  </div>
                  <p>{application.firstName} {application.lastName}</p>
                  <a className={styles.phone} href={`tel:${application.phone}`}><Phone size={14} /> {application.phone}</a>
                  <time dateTime={application.createdAt}>{new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(application.createdAt))}</time>
                </div>
                {section === 'active' && !application.claimed && (
                  <div className={styles.actions}>
                    <span className={`${styles.status} ${styles.status_contacted}`}>Sin cuenta de dueño</span>
                    <button type="button" className={styles.contactButton} disabled={busyId === application.id} onClick={() => generateCode(application)}>Generar código nuevo</button>
                  </div>
                )}
                {section === 'active' && application.billing && (
                  <div className={styles.actions}>
                    <span className={`${styles.status} ${application.billing.status === 'active' ? styles.status_approved : application.billing.status === 'grace' ? styles.status_contacted : styles.status_rejected}`}>
                      {application.billing.status === 'active' ? 'Al día' : application.billing.status === 'grace' ? 'En gracia' : 'Suspendido'} · vence {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(application.billing.dueAt))}
                    </span>
                    <button type="button" className={styles.approveButton} disabled={busyId === application.id} onClick={() => updateSubscription(application, 'extend')}><Check size={15} /> Extender 1 mes</button>
                    {application.billing.status !== 'suspended' && <button type="button" className={styles.rejectButton} aria-label={`Suspender ${application.businessName}`} title="Suspender ahora" disabled={busyId === application.id} onClick={() => updateSubscription(application, 'suspend')}><Ban size={16} /></button>}
                    <button type="button" className={styles.rejectButton} aria-label={`Eliminar ${application.businessName}`} title="Eliminar local definitivamente" disabled={busyId === application.id} onClick={() => deleteBusiness(application)}><Trash2 size={16} /></button>
                  </div>
                )}
                {['pending', 'contacted'].includes(application.status) && (
                  <div className={styles.actions}>
                    {application.status === 'pending' && <button type="button" className={styles.contactButton} disabled={busyId === application.id} onClick={() => updateStatus(application.id, 'contacted')}><Phone size={15} /> Marcar contactado</button>}
                    <button type="button" className={styles.approveButton} disabled={busyId === application.id} onClick={() => updateStatus(application.id, 'approved')}><Check size={15} /> Aprobar</button>
                    <button type="button" className={styles.rejectButton} aria-label={`Rechazar solicitud de ${application.businessName}`} title="Rechazar" disabled={busyId === application.id} onClick={() => updateStatus(application.id, 'rejected')}><Ban size={16} /></button>
                    {busyId === application.id && <LoaderCircle className={styles.spinner} size={17} />}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <p className={styles.note}>{section === 'active' ? 'El plan mostrado es el que el local solicitó al registrarse.' : 'Al aprobar, enviá el código de activación. El local ingresará con el celular y la contraseña que eligió al registrarse.'}</p>
      </section>
    </main>
  )
}

export default AdminDashboard
