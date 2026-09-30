import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function CameraCheckPanel() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [status, setStatus] = useState('')
  const activeRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    if (!user?.isAdmin) return

    supabase
      .from('profiles')
      .select('id, username')
      .neq('id', user.id)
      .order('username', { ascending: true })
      .then(({ data }) => setProfiles(data || []))
  }, [user])

  useEffect(() => {
    if (!active?.id) return

    async function loadSnapshot() {
      const { data, error } = await supabase
        .from('camera_checks')
        .select('status, snapshot_data, snapshot_at, audio_data, audio_at')
        .eq('id', active.id)
        .single()

      if (error) {
        setStatus(error.message)
        return
      }

      setStatus(data.status === 'accepted' ? 'Camera active' : 'En attente employe...')
      setActive((current) => (current ? { ...current, ...data } : current))
    }

    loadSnapshot()
    const intervalId = window.setInterval(loadSnapshot, 1000)
    return () => window.clearInterval(intervalId)
  }, [active?.id])

  useEffect(() => {
    if (!active?.audio_data || !audioRef.current) return

    audioRef.current.load()
    audioRef.current.play().catch(() => {})
  }, [active?.audio_data])

  async function cleanup() {
    const current = activeRef.current

    if (current?.id) {
      await supabase
        .from('camera_checks')
        .update({
          status: 'ended',
          snapshot_data: null,
          snapshot_at: null,
          audio_data: null,
          audio_at: null,
        })
        .eq('id', current.id)
    }

    setActive(null)
    setStatus('')
  }

  async function requestCamera(profile) {
    await cleanup()

    const requestId = crypto.randomUUID()
    setActive({ id: requestId, profile, status: 'requested' })
    setStatus('En attente employe...')

    const { error } = await supabase.from('camera_checks').insert({
      id: requestId,
      manager_id: user.id,
      target_id: profile.id,
      status: 'requested',
    })

    if (error) setStatus(error.message)
  }

  const filtered = profiles.filter((profile) => profile.username.includes(query.trim()))

  if (!user?.isAdmin) return null

  return (
    <section className="admin-camera-panel">
      <h2>Controle camera</h2>
      <input
        type="tel"
        placeholder="Numero employe"
        value={query}
        onChange={(event) => setQuery(event.target.value.replace(/\D/g, ''))}
      />

      <ul>
        {filtered.map((profile) => (
          <li key={profile.id}>
            <span>{profile.username}</span>
            <button type="button" onClick={() => requestCamera(profile)}>
              Ouvrir
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <div className="camera-viewer">
          <div>
            <strong>{active.profile.username}</strong>
            <button type="button" onClick={cleanup}>
              Fermer
            </button>
          </div>
          {active.snapshot_data ? (
            <img src={active.snapshot_data} alt="Camera employe" />
          ) : (
            <div className="camera-placeholder">En attente image...</div>
          )}
          {active.audio_data && (
            <audio ref={audioRef} controls autoPlay playsInline>
              <source src={active.audio_data} />
            </audio>
          )}
          <p>{status}</p>
        </div>
      )}
    </section>
  )
}
