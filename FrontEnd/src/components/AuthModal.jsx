import { Award, ArrowRight, Eye, EyeOff, LoaderCircle, LogOut, Mail, Phone, X } from 'lucide-react'
import { useState } from 'react'
import { apiRequest } from '../lib/api.js'
import styles from './AuthModal.module.css'

function AuthModal({ user, businessSlug, initialMode = 'login', initialPlan = '', partnerOnly = false, onAuthenticate, onClose, onSignOut }) {
  const [mode, setMode] = useState(initialMode)
  const customerFlow = Boolean(businessSlug) && !partnerOnly
  // Desde la landing (sin local) solo se registran locales; desde la tienda de un local, solo clientes.
  const registrationType = businessSlug ? 'customer' : 'local'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [requestedPlan, setRequestedPlan] = useState(initialPlan)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    const isLocalApplication = mode === 'register' && registrationType === 'local'
    if (!customerFlow && mode === 'register' && password !== passwordConfirmation) {
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
        isLocalApplication ? '/local-applications' : customerFlow ? '/auth/phone' : `/auth/${mode === 'register' ? 'register' : 'login'}`,
        {
        method: 'POST',
        body: isLocalApplication
          ? { firstName, lastName, phone, email, password, businessName, requestedPlan }
          : customerFlow
            ? { phone, businessSlug }
          : mode === 'register'
            ? { firstName, lastName, phone, password }
          : { ...(partnerOnly ? { identifier, portal: 'partner' } : { phone }), password, businessSlug },
        },
      )
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
            <button className={styles.secondaryButton} type="button" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</button>
          </div>
        ) : (
          <>
            <span className={styles.kicker}>{partnerOnly ? 'Panel del local' : 'Club Dotty'}</span>
            <h2 id="account-title">{partnerOnly ? 'Ingresar' : customerFlow ? 'Ingresá con tu celular.' : mode === 'login' ? 'Qué bueno verte.' : 'Creá tu local.'}</h2>
            <p className={styles.intro}>{partnerOnly ? 'Ingresá con el email y la contraseña de tu cuenta.' : customerFlow ? 'Usá tu celular para guardar y consultar tus puntos, sin contraseña.' : mode === 'login' ? 'Ingresá a tu cuenta para administrar tu local.' : 'Creá tu cuenta y empezá a usar tu local al instante, con 30 días gratis.'}</p>
            <form className={styles.form} onSubmit={submit}>
              {mode === 'register' && !customerFlow && <>
                <label htmlFor="account-first-name">Nombre</label>
                <input className={styles.passwordInput} id="account-first-name" type="text" autoComplete="given-name" maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
                <label htmlFor="account-last-name">Apellido</label>
                <input className={styles.passwordInput} id="account-last-name" type="text" autoComplete="family-name" maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
              </>}
              <label htmlFor="account-phone">{partnerOnly ? 'Email' : 'Celular'}</label>
              <div className={styles.inputWrap}>{partnerOnly ? <Mail size={17} /> : <Phone size={17} />}<input id="account-phone" type={partnerOnly ? 'email' : 'tel'} autoComplete={partnerOnly ? 'username' : 'tel'} inputMode={partnerOnly ? 'email' : 'tel'} placeholder={partnerOnly ? 'nombre@local.com' : '11 1234 5678'} value={partnerOnly ? identifier : phone} onChange={(event) => partnerOnly ? setIdentifier(event.target.value) : setPhone(event.target.value)} required /></div>
              {mode === 'register' && registrationType === 'local' && <>
                <label htmlFor="account-business-name">Nombre del local</label>
                <input className={styles.passwordInput} id="account-business-name" type="text" autoComplete="organization" maxLength={100} value={businessName} onChange={(event) => setBusinessName(event.target.value)} required />
                <label htmlFor="account-email">Email para ingresar</label>
                <input className={styles.passwordInput} id="account-email" type="email" autoComplete="email" maxLength={254} placeholder="nombre@local.com" value={email} onChange={(event) => setEmail(event.target.value.trimStart())} required />
                <span className={styles.planLabel}>Plan solicitado</span>
                <div className={styles.planOptions} role="group" aria-label="Plan solicitado">
                  <button className={`${styles.planButton} ${requestedPlan === 'basic' ? styles.planSelected : ''}`} type="button" aria-pressed={requestedPlan === 'basic'} onClick={() => setRequestedPlan('basic')}>Básico<small>$15.000/mes</small></button>
                  <button className={`${styles.planButton} ${requestedPlan === 'vip' ? styles.planSelected : ''}`} type="button" aria-pressed={requestedPlan === 'vip'} onClick={() => setRequestedPlan('vip')}>VIP<small>$25.000/mes</small></button>
                  <button className={`${styles.planButton} ${requestedPlan === 'vip_plus' ? styles.planSelected : ''}`} type="button" aria-pressed={requestedPlan === 'vip_plus'} onClick={() => setRequestedPlan('vip_plus')}>VIP PLUS<small>$35.000/mes</small></button>
                </div>
              </>}
              {!customerFlow && (mode === 'login' || mode === 'register') && <>
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
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className={styles.spinner} size={17} /> : null}
                {isSubmitting ? 'Un momento...' : customerFlow || mode === 'login' ? 'Ingresar' : 'Crear mi local'}
                {!isSubmitting && <ArrowRight size={17} />}
              </button>
            </form>
            {!partnerOnly && !customerFlow && <p className={styles.switchMode}>
              {mode === 'login' ? '¿Todavía no tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Registrate' : 'Ingresá'}</button>
            </p>}
          </>
        )}
      </section>
    </div>
  )
}

export default AuthModal
