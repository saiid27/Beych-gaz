import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

function createPeerConnection(onIceCandidate) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  })

  peer.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate)
  }

  return peer
}

export default function CameraRequestListener() {
  const { user } = useAuth()
  const [pending, setPending] = useState(null)
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')
  const previewRef = useRef(null)
  const streamRef = useRef(null)
  const peerRef = useRef(null)
  const callChannelRef = useRef(null)

  useEffect(() => {
    if (!user?.id || user.isAdmin) return

    const channel = supabase
      .channel(`camera-requests:${user.id}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'camera-request' }, ({ payload }) => {
        setError('')
        setPending(payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  function stopSession() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    peerRef.current?.close()
    peerRef.current = null

    if (callChannelRef.current) {
      callChannelRef.current.send({ type: 'broadcast', event: 'ended', payload: {} })
      supabase.removeChannel(callChannelRef.current)
      callChannelRef.current = null
    }

    setActive(null)
    setPending(null)
  }

  async function sendSignal(event, payload) {
    await callChannelRef.current?.send({
      type: 'broadcast',
      event,
      payload,
    })
  }

  async function acceptRequest() {
    if (!pending) return

    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      setActive(pending)
      setPending(null)

      setTimeout(() => {
        if (previewRef.current) previewRef.current.srcObject = stream
      })

      const callChannel = supabase
        .channel(`camera-call:${pending.requestId}`, {
          config: { broadcast: { self: false } },
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const peer = createPeerConnection((candidate) =>
            sendSignal('ice-candidate', { candidate })
          )

          stream.getTracks().forEach((track) => peer.addTrack(track, stream))
          peerRef.current = peer

          await peer.setRemoteDescription(new RTCSessionDescription(payload.offer))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          await sendSignal('answer', { answer })
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.candidate) {
            await peerRef.current?.addIceCandidate(new RTCIceCandidate(payload.candidate))
          }
        })
        .on('broadcast', { event: 'ended' }, stopSession)
        .subscribe(async (subscriptionStatus) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            await callChannel.send({ type: 'broadcast', event: 'accepted', payload: {} })
          }
        })

      callChannelRef.current = callChannel
    } catch {
      setError('Impossible d’ouvrir la caméra. Vérifie les autorisations du navigateur.')
    }
  }

  async function declineRequest() {
    if (!pending) return

    const channel = supabase.channel(`camera-call:${pending.requestId}`)
    channel.subscribe(async (subscriptionStatus) => {
      if (subscriptionStatus !== 'SUBSCRIBED') return

      await channel.send({ type: 'broadcast', event: 'declined', payload: {} })
      setTimeout(() => supabase.removeChannel(channel), 1000)
    })

    setPending(null)
  }

  if (!pending && !active && !error) return null

  return (
    <div className="camera-request-overlay">
      <div className="camera-request-card">
        {pending && (
          <>
            <h2>Demande caméra</h2>
            <p>Le responsable {pending.managerPhone} demande une vérification caméra.</p>
            {error && <p className="auth-error">{error}</p>}
            <div className="camera-actions">
              <button type="button" className="secondary" onClick={declineRequest}>
                Refuser
              </button>
              <button type="button" onClick={acceptRequest}>
                Accepter
              </button>
            </div>
          </>
        )}

        {active && (
          <>
            <h2>Caméra active</h2>
            <video ref={previewRef} autoPlay playsInline muted />
            <button type="button" onClick={stopSession}>
              Terminer
            </button>
          </>
        )}

        {!pending && !active && error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  )
}
