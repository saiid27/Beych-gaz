import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { getMediaStream } from '../lib/mediaAccess'

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
  const processingRef = useRef(null)

  function stopSession() {
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
    if (processingRef.current === request.id || active?.id === request.id) return
    processingRef.current = request.id
    setError('')
    stopSession()

    try {
      await supabase.from('camera_checks').update({ status: 'opening' }).eq('id', request.id)

      const callChannel = supabase
        .channel(`camera-call:${request.id}`, {
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
            const stream = await getMediaStream()
            streamRef.current = stream
            setActive(request)

            setTimeout(() => {
              if (previewRef.current) previewRef.current.srcObject = stream
            })

            await callChannel.send({ type: 'broadcast', event: 'accepted', payload: {} })
            await supabase
              .from('camera_checks')
              .update({ status: 'accepted' })
              .eq('id', request.id)
          } catch {
            await callChannel.send({ type: 'broadcast', event: 'declined', payload: {} })
            await supabase
              .from('camera_checks')
              .update({ status: 'declined' })
              .eq('id', request.id)
            setError('Impossible d’ouvrir la caméra. Vérifie les autorisations du navigateur.')
          }
        })

      callChannelRef.current = callChannel
    } catch {
      await sendSignal('declined', {})
      await supabase.from('camera_checks').update({ status: 'declined' }).eq('id', request.id)
      setError('Impossible d’ouvrir la caméra. Vérifie les autorisations du navigateur.')
    } finally {
      processingRef.current = null
    }
  }

  useEffect(() => {
    if (!user?.id || user.isAdmin) return

    let cancelled = false

    async function loadPendingRequest() {
      const { data } = await supabase
        .from('camera_checks')
        .select('*')
        .eq('target_id', user.id)
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!cancelled && data) {
        setError('')
        startSession(data)
      }
    }

    loadPendingRequest()
    const intervalId = window.setInterval(loadPendingRequest, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
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
