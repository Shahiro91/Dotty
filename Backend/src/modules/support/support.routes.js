import { Router } from 'express'
import { pool } from '../../database/pool.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireAdmin, requirePartnerBilling } from '../../middleware/authorize.js'

const KINDS = ['question', 'suggestion', 'contact']
const columns = `id, business_id AS "businessId", business_name AS "businessName", sender_name AS "senderName",
  sender_contact AS "senderContact", kind, message, resolved, created_at AS "createdAt"`

export const partnerSupportRoutes = Router()
partnerSupportRoutes.post('/partner/support', authenticate, requirePartnerBilling, async (req, res, next) => {
  const kind = req.body?.kind
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!KINDS.includes(kind) || message.length < 5 || message.length > 2000) {
    return res.status(400).json({ error: 'Escribí tu mensaje (entre 5 y 2000 caracteres).' })
  }
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO support_messages (business_id, business_name, sender_name, sender_contact, kind, message)
       SELECT b.id, b.name, TRIM(c.first_name || ' ' || c.last_name), COALESCE(c.email, c.phone, ''), $2, $3
       FROM customers c JOIN businesses b ON b.id = c.business_id WHERE c.id = $1`,
      [req.customerId, kind, message],
    )
    if (!rowCount) return res.status(404).json({ error: 'No encontramos tu local.' })
    res.status(201).json({ sent: true })
  } catch (error) { next(error) }
})

export const adminSupportRoutes = Router()
adminSupportRoutes.get('/support', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${columns} FROM support_messages ORDER BY resolved, created_at DESC LIMIT 500`)
    res.json({ messages: rows })
  } catch (error) { next(error) }
})

adminSupportRoutes.patch('/support/:id', authenticate, requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || typeof req.body?.resolved !== 'boolean') return res.status(400).json({ error: 'La acción no es válida.' })
  try {
    const { rows } = await pool.query(`UPDATE support_messages SET resolved = $2 WHERE id = $1 RETURNING ${columns}`, [id, req.body.resolved])
    if (!rows[0]) return res.status(404).json({ error: 'No encontramos el mensaje.' })
    res.json({ message: rows[0] })
  } catch (error) { next(error) }
})

adminSupportRoutes.delete('/support/:id', authenticate, requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'La acción no es válida.' })
  try {
    await pool.query('DELETE FROM support_messages WHERE id = $1', [id])
    res.json({ deleted: true })
  } catch (error) { next(error) }
})
