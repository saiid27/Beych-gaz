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
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')
  const previewRef = useRef(null)
  const streamRef = useRef(null)
  const peerRef = useRef(null)
  const callChannelRef = useRef(null)

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
  }

  async function sendSignal(event, payload) {
    await callChannelRef.current?.send({
      type: 'broadcast',
      event,
      payload,
    })
  }

  async function startSession(request) {
    setError('')
    stopSession()

    try {
      const callChannel = supabase
        .channel(`camera-call:${request.requestId}`, {
          config: { broadcast: { self: false } },
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const stream = streamRef.current
          if (!stream) return

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
          if (subscriptionStatus !== 'SUBSCRIBED') return

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            streamRef.current = stream
            setActive(request)

            setTimeout(() => {
              if (previewRef.current) previewRef.current.srcObject = stream
            })

            await callChannel.send({ type: 'broadcast', event: 'accepted', payload: {} })
          } catch {
            await callChannel.send({ type: 'broadcast', event: 'declined', payload: {} })
            setError('Impossible d’ouvrir la caméra. Vérifie les autorisations du navigateur.')
          }
        })

      callChannelRef.current = callChannel
    } catch {
      await sendSignal('declined', {})
      setError('Impossible d’ouvrir la caméra. Vérifie les autorisations du navigateur.')
    }
  }

  useEffect(() => {
    if (!user?.id || user.isAdmin) return

    const channel = supabase
      .channel(`camera-requests:${user.id}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'camera-request' }, ({ payload }) => {
        setError('')
        startSession(payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.isAdmin])

  if (!active && !error) return null

  return (
    <div className="camera-request-overlay">
      <div className="camera-request-card">
        {active && (
          <>
            <h2>Caméra active</h2>
            <p>Vérification caméra en cours par le responsable {active.managerPhone}.</p>
            <video ref={previewRef} autoPlay playsInline muted />
            <button type="button" onClick={stopSession}>
              Terminer
            </button>
          </>
        )}

        {!active && error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  )
}
