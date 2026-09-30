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
        throw new Error('Ce navigateur ne prend pas en charge la camera.')
      }

      await getMediaStream()
      await getAudioStream().catch(() => {})

      window.localStorage.setItem(PERMISSION_KEY, 'true')
      setAllowed(true)
    } catch {
      setError('Autorise la camera depuis le navigateur pour continuer.')
    } finally {
      setLoading(false)
    }
  }

  if (allowed) return children

  return (
    <div className="permission-screen">
      <div className="permission-card">
        <div className="auth-brand">Bych Gaz</div>
        <h1>Autorisation requise</h1>
        <p>
          Autorise l'acces a la camera et au micro. La camera reste prete pendant
          l'utilisation de l'application.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <button type="button" onClick={requestMediaAccess} disabled={loading}>
          {loading ? 'Demande...' : 'Autoriser'}
        </button>
      </div>
    </div>
  )
}
