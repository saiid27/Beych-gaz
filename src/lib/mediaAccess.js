let mediaStream = null
let audioStream = null
let currentFacingMode = 'user'

export async function getMediaStream({ facingMode = 'user', force = false } = {}) {
  if (mediaStream?.active && currentFacingMode === facingMode && !force) return mediaStream

  mediaStream?.getVideoTracks().forEach((track) => track.stop())

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode } },
    audio: false,
  })
  currentFacingMode = facingMode

  return mediaStream
}

export async function getAudioStream() {
  if (audioStream?.active) return audioStream

  audioStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: true,
  })

  return audioStream
}

export function hasActiveMediaStream() {
  return Boolean(mediaStream?.active)
}

export function stopMediaStream() {
  mediaStream?.getTracks().forEach((track) => track.stop())
  audioStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
  audioStream = null
}
