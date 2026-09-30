import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function CameraCheckPanel() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [status, setStatus] = useState('')
  const [facingMode, setFacingMode] = useState('user')
  const activeRef = useRef(null)
  const audioRef = useRef(null)
  const audioQueueRef = useRef([])
  const lastAudioAtRef = useRef('')
  const isPlayingAudioRef = useRef(false)

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

  function resetAudioQueue() {
    audioQueueRef.current = []
    lastAudioAtRef.current = ''
    isPlayingAudioRef.current = false

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
  }

  function playNextAudio() {
    const audio = audioRef.current
    const next = audioQueueRef.current.shift()

    if (!audio || !next) {
      isPlayingAudioRef.current = false
      return
    }

    isPlayingAudioRef.current = true
    audio.src = next
    audio.play().catch(() => {
      isPlayingAudioRef.current = false
    })
  }

  useEffect(() => {
    if (!active?.id) return

    async function loadSnapshot() {
      const { data, error } = await supabase
        .from('camera_checks')
        .select('status, snapshot_data, snapshot_at, audio_data, audio_at, facing_mode')
        .eq('id', active.id)
        .single()

      if (error) {
        setStatus(error.message)
        return
      }

      const labels = {
        accepted: 'الكاميرا تعمل',
        declined: 'تم رفض الوصول',
        ended: 'مغلق',
        requested: 'في انتظار الموظف...',
      }
      setStatus(labels[data.status] || data.status)
      setActive((current) => (current ? { ...current, ...data } : current))
    }

    resetAudioQueue()
    loadSnapshot()
    const intervalId = window.setInterval(loadSnapshot, 1000)
    return () => window.clearInterval(intervalId)
  }, [active?.id])

  useEffect(() => {
    if (!active?.audio_data || !active?.audio_at || active.audio_at === lastAudioAtRef.current) {
      return
    }

    lastAudioAtRef.current = active.audio_at
    audioQueueRef.current.push(active.audio_data)

    if (!isPlayingAudioRef.current) playNextAudio()
  }, [active?.audio_data, active?.audio_at])

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

    resetAudioQueue()
    setActive(null)
    setStatus('')
  }

  async function requestCamera(profile) {
    await cleanup()
    await supabase
      .from('camera_checks')
      .update({
        status: 'ended',
        snapshot_data: null,
        snapshot_at: null,
        audio_data: null,
        audio_at: null,
      })
      .eq('target_id', profile.id)

    const requestId = crypto.randomUUID()
    resetAudioQueue()
    setActive({ id: requestId, profile, status: 'requested', facing_mode: facingMode })
    setStatus('في انتظار الموظف...')

    const { error } = await supabase.from('camera_checks').insert({
      id: requestId,
      manager_id: user.id,
      target_id: profile.id,
      status: 'requested',
      facing_mode: facingMode,
    })

    if (error) setStatus(error.message)
  }

  const filtered = profiles.filter((profile) => profile.username.includes(query.trim()))

  if (!user?.isAdmin) return null

  return (
    <section className="admin-camera-panel">
      <h2>مراقبة الكاميرا</h2>

      <div className="camera-mode-toggle" role="group" aria-label="اختيار الكاميرا">
        <button
          type="button"
          className={facingMode === 'user' ? 'active' : ''}
          onClick={() => setFacingMode('user')}
        >
          أمامية
        </button>
        <button
          type="button"
          className={facingMode === 'environment' ? 'active' : ''}
          onClick={() => setFacingMode('environment')}
        >
          خلفية
        </button>
      </div>

      <input
        type="tel"
        placeholder="رقم الموظف"
        value={query}
        onChange={(event) => setQuery(event.target.value.replace(/\D/g, ''))}
      />

      <ul>
        {filtered.map((profile) => (
          <li key={profile.id}>
            <span>{profile.username}</span>
            <button type="button" onClick={() => requestCamera(profile)}>
              فتح
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <div className="camera-viewer">
          <div>
            <strong>{active.profile.username}</strong>
            <button type="button" onClick={cleanup}>
              إغلاق
            </button>
          </div>
          {active.snapshot_data ? (
            <img src={active.snapshot_data} alt="كاميرا الموظف" />
          ) : (
            <div className="camera-placeholder">في انتظار الصورة...</div>
          )}
          <audio ref={audioRef} controls autoPlay playsInline onEnded={playNextAudio} />
          <p>
            {status} - {active.facing_mode === 'environment' ? 'الخلفية' : 'الأمامية'}
          </p>
        </div>
      )}
    </section>
  )
}
