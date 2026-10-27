import { useEffect, useState } from 'react'
import AdminDashboard from './components/AdminDashboard.jsx'
import AuthModal from './components/AuthModal.jsx'
import LandingPage from './components/LandingPage.jsx'
import LocalStorefront from './components/LocalStorefront.jsx'
import PartnerDashboard from './components/PartnerDashboard.jsx'
import { apiRequest } from './lib/api.js'

function App() {
  const [authRequest, setAuthRequest] = useState(null)
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('sabor-vivo-session'))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!session?.token) return
    const slugMatch = window.location.pathname.match(/^\/local\/([^/]+)\/?$/)
    const storefrontSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : ''

    apiRequest(`/auth/me${storefrontSlug ? `?businessSlug=${encodeURIComponent(storefrontSlug)}` : ''}`, { token: session.token })
      .then((user) => {
        setSession((current) => {
          const updatedSession = { ...current, user }
          window.localStorage.setItem('sabor-vivo-session', JSON.stringify(updatedSession))
          return updatedSession
        })
      })
      .catch((error) => {
        if (error.status !== 401) return
        window.localStorage.removeItem('sabor-vivo-session')
        setSession(null)
      })
  }, [])

  function saveSession(nextSession) {
    setSession(nextSession)
    window.localStorage.setItem('sabor-vivo-session', JSON.stringify(nextSession))
    setAuthRequest(null)
  }

  function signOut() {
    window.localStorage.removeItem('sabor-vivo-session')
    setSession(null)
    setAuthRequest(null)
  }

  if (session?.user?.role === 'admin') {
    return <AdminDashboard token={session.token} onSignOut={signOut} />
  }
  if (session?.user?.role === 'local_owner') {
    return <PartnerDashboard token={session.token} user={session.user} onSignOut={signOut} />
  }
  const storefrontMatch = window.location.pathname.match(/^\/local\/([^/]+)\/?$/)
  if (storefrontMatch) {
    return <LocalStorefront slug={decodeURIComponent(storefrontMatch[1])} session={session} onAuthenticate={saveSession} onSignOut={signOut} />
  }

  return (
    <>
      <LandingPage
        onLogin={() => setAuthRequest({ mode: 'login', audience: 'partner' })}
        onRegister={() => setAuthRequest({ mode: 'register' })}
      />
      {authRequest && (
        <AuthModal
          user={session?.user}
          initialMode={authRequest.mode}
          partnerOnly={authRequest.audience === 'partner'}
          onAuthenticate={saveSession}
          onClose={() => setAuthRequest(null)}
          onSignOut={signOut}
        />
      )}
    </>
  )
}

export default App
