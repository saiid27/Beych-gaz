let mediaStream = null
let audioStream = null

export async function getMediaStream() {
  if (mediaStream?.active) return mediaStream

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  })

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
