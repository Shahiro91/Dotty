const rateBuckets = new Map()

export function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const now = Date.now()
    const key = `${name}:${req.ip}`
    const bucket = rateBuckets.get(key)
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (bucket.count >= max) {
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' })
    }
    bucket.count += 1
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt < now) rateBuckets.delete(key)
}, 10 * 60_000).unref()
