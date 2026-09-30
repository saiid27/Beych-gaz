import { useState } from 'react'
import { getAudioStream, getMediaStream, hasActiveMediaStream } from '../lib/mediaAccess'

const PERMISSION_KEY = 'beych_gaz_media_permission_ok'

export default function PermissionGate({ children }) {
  const [allowed, setAllowed] = useState(
    () => window.localStorage.getItem(PERMISSION_KEY) === 'true' && hasActiveMediaStream()
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestMediaAccess() {
    setError('')
    setLoading(true)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('هذا المتصفح لا يدعم الكاميرا.')
      }

      await getMediaStream()
      await getAudioStream().catch(() => {})

      window.localStorage.setItem(PERMISSION_KEY, 'true')
      setAllowed(true)
    } catch {
      setError('اسمح بالكاميرا والميكروفون من المتصفح للمتابعة.')
    } finally {
      setLoading(false)
    }
  }

  if (allowed) return children

  return (
    <div className="permission-screen">
      <div className="permission-card">
        <div className="auth-logo">BG</div>
        <div className="auth-brand">Bych Gaz</div>
        <h1>السماح مطلوب</h1>
        <p>اسمح للكاميرا والميكروفون حتى يعمل التطبيق بشكل كامل أثناء الاستخدام.</p>
        {error && <p className="auth-error">{error}</p>}
        <button type="button" onClick={requestMediaAccess} disabled={loading}>
          {loading ? 'جاري الطلب...' : 'السماح'}
        </button>
      </div>
    </div>
  )
}
