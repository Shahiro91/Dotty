// En producción el backend sirve el frontend, así que la API es del mismo dominio.
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3000')

export async function apiRequest(path, { token, body, ...options } = {}) {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'No se pudo conectar con el servidor')
    error.status = response.status
    error.code = result.code
    throw error
  }
  return result
}