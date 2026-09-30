import { ensureSchema, getPool, sendJson } from '../_db.js'
import { hashPassword } from '../_password.js'

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'الطريقة غير مسموحة' })
  }

  const phone = normalizePhone(req.body?.phone)
  const password = String(req.body?.password || '')

  if (phone.length < 6) {
    return sendJson(res, 400, { error: 'رقم الهاتف غير صالح' })
  }

  if (password.length < 6) {
    return sendJson(res, 400, { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  }

  await ensureSchema()
  const pool = getPool()
  const client = await pool.connect()

  try {
    const { salt, hash } = hashPassword(password)

    await client.query('begin')

    const userResult = await client.query(
      `
        insert into app_users (phone, password_salt, password_hash)
        values ($1, $2, $3)
        returning id, phone, is_admin, created_at
      `,
      [phone, salt, hash]
    )

    const user = userResult.rows[0]

    const profileResult = await client.query(
      `
        insert into profiles (id, username)
        values ($1, $2)
        returning id, username, avatar_url, created_at
      `,
      [user.id, user.phone]
    )

    await client.query('commit')

    return sendJson(res, 201, {
      user: { id: user.id, phone: user.phone, isAdmin: user.is_admin },
      profile: profileResult.rows[0],
    })
  } catch (error) {
    await client.query('rollback')

    if (error.code === '23505') {
      return sendJson(res, 409, { error: 'هذا الرقم مسجل من قبل' })
    }

    console.error(error)
    return sendJson(res, 500, { error: 'حدث خطأ في الخادم' })
  } finally {
    client.release()
  }
}
