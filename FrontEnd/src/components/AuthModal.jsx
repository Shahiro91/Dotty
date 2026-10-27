import { Award, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LogOut, Mail, Phone, X } from 'lucide-react'
import { useState } from 'react'
import { apiRequest } from '../lib/api.js'
import styles from './AuthModal.module.css'

function AuthModal({ user, businessSlug, initialMode = 'login', partnerOnly = false, onAuthenticate, onClose, onSignOut }) {
  const [mode, setMode] = useState(initialMode)
  // Desde la landing (sin local) solo se registran locales; desde la tienda de un local, solo clientes.
  const registrationType = businessSlug ? 'customer' : 'local'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [requestedPlan, setRequestedPlan] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [applicationSent, setApplicationSent] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [claimCode, setClaimCode] = useState('')

  async function claimBusiness(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const { token } = JSON.parse(window.localStorage.getItem('sabor-vivo-session') || '{}')
      const result = await apiRequest('/auth/claim-business', { method: 'POST', token, body: { code: claimCode } })
      onAuthenticate(result)
    } catch (claimError) {
      setError(claimError.message)
    } finally {
      setIsSubmitting(false)
    }
  }
  async function submit(event) {
    event.preventDefault()
    setError('')
    const isLocalApplication = mode === 'register' && registrationType === 'local'
    if (mode === 'register' && password !== passwordConfirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (isLocalApplication && !requestedPlan) {
      setError('Elegí el plan que solicita tu local.')
      return
    }
    setIsSubmitting(true)
    try {
      const result = await apiRequest(
        isLocalApplication ? '/local-applications' : `/auth/${mode === 'register' ? 'register' : 'login'}`,
        {
        method: 'POST',
        body: isLocalApplication
          ? { firstName, lastName, phone, email, password, businessName, requestedPlan }
          : mode === 'register'
            ? { firstName, lastName, phone, password }
            : { ...(partnerOnly ? { identifier: phone, portal: 'partner', activationCode: claimCode } : { phone }), password, businessSlug },
        },
      )
      if (isLocalApplication) {
        setApplicationSent(true)
        return
      }
      onAuthenticate(result)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className={styles.close} type="button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button>
        {user && !partnerOnly ? (
          <div className={styles.account}>
            <span className={styles.kicker}>Club Dotty</span>
            <h2 id="account-title">Tu cuenta</h2>
            <p className={styles.phone}>{user.phone}</p>
            <div className={styles.points}><Award size={23} /><span><strong>{user.points}</strong> puntos</span></div>
            <p className={styles.hint}>Sumás 1 punto por cada $1.000 en pedidos enviados.</p>
            <form className={styles.claimForm} onSubmit={claimBusiness}>
              <label htmlFor="claim-code">¿Tenés un código de local?</label>
              <input id="claim-code" value={claimCode} maxLength={9} autoComplete="off" placeholder="XXXX-XXXX" onChange={(event) => setClaimCode(event.target.value.toUpperCase())} />
              <button className={styles.secondaryButton} type="submit" disabled={isSubmitting || claimCode.length < 8}>{isSubmitting ? 'Verificando...' : 'Activar mi local'}</button>
              {error && <p role="alert" className={styles.hint}>{error}</p>}
            </form>
            <button className={styles.secondaryButton} type="button" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</button>
          </div>
        ) : (
          <>
            <span className={styles.kicker}>{partnerOnly ? 'Panel del local' : 'Club Dotty'}</span>
            <h2 id="account-title">{partnerOnly ? 'Ingresar' : applicationSent ? 'Solicitud recibida.' : mode === 'login' ? 'Qué bueno verte.' : registrationType === 'local' ? 'Conversemos sobre tu local.' : 'Sumate al club.'}</h2>
            {applicationSent ? (
              <div className={styles.applicationSuccess} role="status">
                <CheckCircle2 size={30} />
                <p>Gracias, {firstName}. Registramos {email} como usuario de acceso y guardamos tu contraseña. Revisaremos los datos; si aprobamos el local, te enviaremos un código para activar tu primer ingreso.</p>
                <button className={styles.submitButton} type="button" onClick={onClose}>Entendido</button>
              </div>
            ) : <>
            <p className={styles.intro}>{partnerOnly ? 'Ingresá con el email y la contraseña del local. El administrador puede usar su celular. Si es tu primer ingreso, también necesitás el código de activación.' : mode === 'login' ? (businessSlug ? 'Ingresá para guardar y consultar tus puntos.' : 'Ingresá a tu cuenta para administrar tu local.') : registrationType === 'local' ? 'Dejanos tus datos, elegí tu email de acceso y una contraseña. Si aprobamos la solicitud, te enviaremos un código para activar tu primer ingreso.' : 'Creá tu cuenta para empezar a sumar puntos.'}</p>
            <form className={styles.form} onSubmit={submit}>
              {mode === 'register' && <>
                <label htmlFor="account-first-name">Nombre</label>
                <input className={styles.passwordInput} id="account-first-name" type="text" autoComplete="given-name" maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
                <label htmlFor="account-last-name">Apellido</label>
                <input className={styles.passwordInput} id="account-last-name" type="text" autoComplete="family-name" maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
              </>}
              <label htmlFor="account-phone">{partnerOnly ? 'Email del local o celular del administrador' : 'Celular'}</label>
              <div className={styles.inputWrap}>{partnerOnly ? <Mail size={17} /> : <Phone size={17} />}<input id="account-phone" type={partnerOnly ? 'text' : 'tel'} autoComplete={partnerOnly ? 'username' : 'tel'} inputMode={partnerOnly ? 'text' : 'tel'} placeholder={partnerOnly ? 'nombre@local.com' : '+54 9 11 1234 5678'} value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
              {mode === 'register' && registrationType === 'local' && <>
                <label htmlFor="account-business-name">Nombre del local</label>
                <input className={styles.passwordInput} id="account-business-name" type="text" autoComplete="organization" maxLength={100} value={businessName} onChange={(event) => setBusinessName(event.target.value)} required />
                <label htmlFor="account-email">Email para ingresar</label>
                <input className={styles.passwordInput} id="account-email" type="email" autoComplete="email" maxLength={254} placeholder="nombre@local.com" value={email} onChange={(event) => setEmail(event.target.value.trimStart())} required />
                <span className={styles.planLabel}>Plan solicitado</span>
                <div className={styles.planOptions} role="group" aria-label="Plan solicitado">
                  <button className={`${styles.planButton} ${requestedPlan === 'basic' ? styles.planSelected : ''}`} type="button" aria-pressed={requestedPlan === 'basic'} onClick={() => setRequestedPlan('basic')}>Básico</button>
                  <button className={`${styles.planButton} ${requestedPlan === 'vip' ? styles.planSelected : ''}`} type="button" aria-pressed={requestedPlan === 'vip'} onClick={() => setRequestedPlan('vip')}>VIP</button>
                </div>
              </>}
              {(mode === 'login' || mode === 'register') && <>
                <label htmlFor="account-password">Contraseña</label>
                <div className={styles.passwordField}>
                  <input className={styles.passwordInput} id="account-password" type={passwordVisible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={72} placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <button className={styles.passwordToggle} type="button" aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={passwordVisible} title={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setPasswordVisible((visible) => !visible)}>
                    {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {mode === 'register' && <>
                  <label htmlFor="account-password-confirmation">Comprobación de contraseña</label>
                  <div className={styles.passwordField}>
                    <input className={styles.passwordInput} id="account-password-confirmation" type={confirmationVisible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="Repetí tu contraseña" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
                    <button className={styles.passwordToggle} type="button" aria-label={confirmationVisible ? 'Ocultar comprobación' : 'Mostrar comprobación'} aria-pressed={confirmationVisible} title={confirmationVisible ? 'Ocultar comprobación' : 'Mostrar comprobación'} onClick={() => setConfirmationVisible((visible) => !visible)}>
                      {confirmationVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </>}
              </>}
              {mode === 'login' && partnerOnly && <>
                <label htmlFor="local-activation-code">Código de activación (si es tu primer ingreso)</label>
                <input className={styles.passwordInput} id="local-activation-code" type="text" autoComplete="one-time-code" maxLength={9} placeholder="XXXX-XXXX" value={claimCode} onChange={(event) => setClaimCode(event.target.value.toUpperCase())} />
              </>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className={styles.spinner} size={17} /> : null}
                {isSubmitting ? 'Un momento...' : mode === 'login' ? 'Ingresar' : registrationType === 'local' ? 'Enviar solicitud' : 'Crear cuenta'}
                {!isSubmitting && <ArrowRight size={17} />}
              </button>
            </form>
            {!partnerOnly && <p className={styles.switchMode}>
              {mode === 'login' ? '¿Todavía no tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setApplicationSent(false); setError('') }}>{mode === 'login' ? 'Registrate' : 'Ingresá'}</button>
            </p>}
            </>}
          </>
        )}
      </section>
    </div>
  )
}

export default AuthModal
