import express, { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePartner } from '../../middleware/authorize.js'
import { deleteVideo, findVideo, saveVideo } from './videos.repository.js'

const router = Router()

router.get('/public/businesses/:slug/videos/:videoId', async (req, res, next) => {
  const videoId = Number(req.params.videoId)
  if (!Number.isSafeInteger(videoId) || videoId < 1) return res.sendStatus(404)
  try {
    const video = await findVideo(req.params.slug, videoId)
    if (!video) return res.sendStatus(404)
    const { data, mimeType, size } = video
    const range = req.headers.range
    let start = 0
    let end = size - 1
    let status = 200
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) {
        res.set('Content-Range', `bytes */${size}`)
        return res.sendStatus(416)
      }
      if (!match[1]) start = Math.max(0, size - Number(match[2]))
      else start = Number(match[1])
      if (match[1] && match[2]) end = Math.min(size - 1, Number(match[2]))
      if (start >= size || end < start) {
        res.set('Content-Range', `bytes */${size}`)
        return res.sendStatus(416)
      }
      status = 206
    }
    const chunk = data.subarray(start, end + 1)
    res.status(status).set({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': String(chunk.length),
      'Content-Type': mimeType,
      'X-Content-Type-Options': 'nosniff',
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    }).send(chunk)
  } catch (error) { next(error) }
})

router.post('/partner/business/videos', authenticate, requirePartner, express.raw({
  type: ['video/mp4', 'video/webm', 'video/quicktime'],
  limit: 30 * 1024 * 1024,
}), async (req, res, next) => {
  const video = req.body
  if (!Buffer.isBuffer(video) || video.length === 0) return res.status(400).json({ error: 'Elegí un archivo de video válido.' })
  let originalName = 'video'
  try { originalName = decodeURIComponent(req.get('x-file-name') || 'video').split(/[\\/]/).pop().slice(0, 200) || 'video' } catch {}
  try {
    const result = await saveVideo(req.businessId, originalName, req.get('content-type'), video)
    if (result.error === 'business_not_found') return res.status(404).json({ error: 'No encontramos el local.' })
    if (result.error === 'video_count') return res.status(400).json({ error: 'Podés guardar hasta 5 videos en el carrusel.' })
    if (result.error === 'video_space') return res.status(400).json({ error: 'El espacio total de videos del local no puede superar 90 MB.' })
    res.status(201).json({ video: result.video })
  } catch (error) { next(error) }
})

router.delete('/partner/business/videos/:videoId', authenticate, requirePartner, async (req, res, next) => {
  const videoId = Number(req.params.videoId)
  if (!Number.isSafeInteger(videoId) || videoId < 1) return res.status(400).json({ error: 'El video no es válido.' })
  try {
    if (!await deleteVideo(req.businessId, videoId)) return res.status(404).json({ error: 'No encontramos ese video.' })
    res.sendStatus(204)
  } catch (error) { next(error) }
})

export { router as videoRoutes }
