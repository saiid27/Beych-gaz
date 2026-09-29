import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, expectedHash) {
  const hash = scryptSync(password, salt, KEY_LENGTH)
  const expected = Buffer.from(expectedHash, 'hex')

  if (hash.length !== expected.length) return false
  return timingSafeEqual(hash, expected)
}
