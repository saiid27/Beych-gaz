import { ensureSchema, getPool, sendJson } from './_db.js'
import { createClient } from '@supabase/supabase-js'

function isAuthorized(req) {
  if (!process.env.CRON_SECRET) return true
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' })
  }

  try {
    await ensureSchema()
    const pool = getPool()
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

    const oldObjects = await pool.query(`
      select name
      from storage.objects
      where bucket_id = 'chat-images'
        and created_at < now() - interval '60 minutes'
    `)

    let deletedStorageObjects = 0
    const objectNames = oldObjects.rows.map((row) => row.name)

    for (let i = 0; i < objectNames.length; i += 100) {
      const batch = objectNames.slice(i, i + 100)
      const { data, error } = await supabase.storage.from('chat-images').remove(batch)
      if (error) throw error
      deletedStorageObjects += data?.length || 0
    }

    const removedImageMessages = await pool.query(`
      delete from messages
      where image_url is not null
        and content is null
        and created_at < now() - interval '60 minutes'
    `)

    const clearedMixedMessages = await pool.query(`
      update messages
      set image_url = null
      where image_url is not null
        and content is not null
        and created_at < now() - interval '60 minutes'
    `)

    const clearedCameraSnapshots = await pool.query(`
      update camera_checks
      set snapshot_data = null,
          snapshot_at = null
      where snapshot_at < now() - interval '60 minutes'
    `)

    const clearedCameraAudio = await pool.query(`
      update camera_checks
      set audio_data = null,
          audio_at = null
      where audio_at < now() - interval '60 minutes'
    `)

    return sendJson(res, 200, {
      ok: true,
      deletedStorageObjects,
      deletedImageMessages: removedImageMessages.rowCount,
      clearedMixedMessages: clearedMixedMessages.rowCount,
      clearedCameraSnapshots: clearedCameraSnapshots.rowCount,
      clearedCameraAudio: clearedCameraAudio.rowCount,
    })
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Erreur serveur' })
  }
}
