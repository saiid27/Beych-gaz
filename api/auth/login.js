import { ensureSchema, getPool, sendJson } from '../_db.js'
import { verifyPassword } from '../_password.js'

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  const phone = normalizePhone(req.body?.phone)
  const password = String(req.body?.password || '')

  if (!phone || !password) {
    return sendJson(res, 400, { error: 'Numéro et mot de passe requis' })
  }

  try {
    await ensureSchema()

    const { rows } = await getPool().query(
      `
        select
          app_users.id,
          app_users.phone,
          app_users.is_admin,
          app_users.password_salt,
          app_users.password_hash,
          profiles.username,
          profiles.avatar_url,
          profiles.created_at
        from app_users
        join profiles on profiles.id = app_users.id
        where app_users.phone = $1
        limit 1
      `,
      [phone]
    )

    const row = rows[0]

    if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
      return sendJson(res, 401, { error: 'Numéro ou mot de passe incorrect' })
    }

    return sendJson(res, 200, {
      user: { id: row.id, phone: row.phone, isAdmin: row.is_admin },
      profile: {
        id: row.id,
        username: row.username,
        avatar_url: row.avatar_url,
        created_at: row.created_at,
      },
    })
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Erreur serveur' })
  }
}
