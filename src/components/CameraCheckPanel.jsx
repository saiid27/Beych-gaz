import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

function createPeerConnection(onIceCandidate, onTrack) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })

  peer.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate)
  }

  peer.ontrack = (event) => {
    onTrack(event.streams[0])
  }

  return peer
}

export default function CameraCheckPanel() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(null)
  const [status, setStatus] = useState('')
  const videoRef = useRef(null)
  const callChannelRef = useRef(null)
  const peerRef = useRef(null)

  useEffect(() => {
    if (!user?.isAdmin) return

    supabase
      .from('profiles')
      .select('id, username')
      .neq('id', user.id)
      .order('username', { ascending: true })
      .then(({ data }) => setProfiles(data || []))
  }, [user])

  function cleanup() {
    peerRef.current?.close()
    peerRef.current = null

    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current)
      callChannelRef.current = null
    }

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
  }

  async function sendSignal(event, payload) {
    await callChannelRef.current?.send({
      type: 'broadcast',
      event,
      payload,
    })
  }

  async function startPeer() {
    if (peerRef.current) return
    setStatus('Connexion...')

    const peer = createPeerConnection(
      (candidate) => sendSignal('ice-candidate', { candidate }),
      (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('Caméra active')
      }
    )

    peerRef.current = peer
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    await peer.setLocalDescription(offer)
    await sendSignal('offer', { offer })
  }

  async function requestCamera(profile) {
    cleanup()

    const requestId = crypto.randomUUID()
    setActive({ requestId, profile })
    setStatus('En attente employé...')

    const callChannel = supabase
      .channel(`camera-call:${requestId}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'accepted' }, () => startPeer())
      .on('broadcast', { event: 'declined' }, () => setStatus('Demande refusée'))
      .on('broadcast', { event: 'ended' }, () => {
        setStatus('Session terminée')
        cleanup()
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        await peerRef.current?.setRemoteDescription(new RTCSessionDescription(payload.answer))
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.candidate) {
          await peerRef.current?.addIceCandidate(new RTCIceCandidate(payload.candidate))
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'camera_checks',
          filter: `id=eq.${requestId}`,
        },
        ({ new: check }) => {
          if (check.status === 'accepted') startPeer()
          if (check.status === 'declined') setStatus('Ouverture refusée')
        }
      )
      .subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus !== 'SUBSCRIBED') return

        const { error } = await supabase.from('camera_checks').insert({
          id: requestId,
          manager_id: user.id,
          target_id: profile.id,
          status: 'requested',
        })

        if (error) setStatus(error.message)
      })

    callChannelRef.current = callChannel
  }

  const filtered = profiles.filter((profile) => profile.username.includes(query.trim()))

  if (!user?.isAdmin) return null

  return (
    <section className="admin-camera-panel">
      <h2>Contrôle caméra</h2>
      <input
        type="tel"
        placeholder="Numéro employé"
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
          <video ref={videoRef} autoPlay playsInline controls />
          <p>{status}</p>
        </div>
      )}
    </section>
  )
}
