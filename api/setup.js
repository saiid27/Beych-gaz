import { ensureSchema, sendJson } from './_db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  try {
    await ensureSchema()
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Erreur serveur' })
  }
}
