import { pool } from '../../database/pool.js'

export async function findVideo(slug, videoId) {
  const { rows } = await pool.query(
    `SELECT v.mime_type AS "mimeType", v.video_data AS data, v.size_bytes AS size
     FROM business_videos v JOIN businesses b ON b.id = v.business_id
     WHERE b.slug = $1 AND v.id = $2`,
    [slug, videoId],
  )
  return rows[0]
}

export async function saveVideo(businessId, originalName, mimeType, video) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query('SELECT id FROM businesses WHERE id = $1 FOR UPDATE', [businessId])
    if (!rowCount) {
      await client.query('ROLLBACK')
      return { error: 'business_not_found' }
    }
    const { rows: usage } = await client.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(size_bytes), 0)::int AS bytes FROM business_videos WHERE business_id = $1', [businessId])
    if (usage[0].count >= 5) {
      await client.query('ROLLBACK')
      return { error: 'video_count' }
    }
    if (usage[0].bytes + video.length > 90 * 1024 * 1024) {
      await client.query('ROLLBACK')
      return { error: 'video_space' }
    }
    const { rows } = await client.query(
      `INSERT INTO business_videos (business_id, original_name, mime_type, size_bytes, video_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, original_name AS name, size_bytes AS "sizeBytes"`,
      [businessId, originalName, mimeType, video.length, video],
    )
    await client.query('COMMIT')
    return { video: rows[0] }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function deleteVideo(businessId, videoId) {
  const { rowCount } = await pool.query('DELETE FROM business_videos WHERE id = $1 AND business_id = $2', [videoId, businessId])
  return rowCount
}
