let mediaStream = null

export async function getMediaStream() {
  if (mediaStream?.active) return mediaStream

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })
  } catch {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    })
  }

  return mediaStream
}

export function hasActiveMediaStream() {
  return Boolean(mediaStream?.active)
}

export function stopMediaStream() {
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
}
