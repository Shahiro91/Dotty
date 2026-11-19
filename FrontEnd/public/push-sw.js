self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch (error) {
    console.error('Notificación push inválida:', error)
    return
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Dotty', {
    body: payload.body || '',
    icon: '/logo.svg',
    data: { url: payload.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  if (url.origin !== self.location.origin) return
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url === url.href)
    if (existing) return existing.focus()
    return self.clients.openWindow(url.href)
  }))
})
