import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchMessages, sendMessage, uploadChatAudio, uploadChatImage } from '../lib/chat'
import { conversationLabel } from './Sidebar'

function getAudioMimeType() {
  if (!window.MediaRecorder) return ''

  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatMessageTime(dateText) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateText))
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
    </svg>
  )
}

function PlayIcon({ paused }) {
  if (!paused) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5h3v14H8z" />
        <path d="M13 5h3v14h-3z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function VoiceNote({ src, time }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const bars = [9, 16, 22, 14, 25, 18, 30, 13, 20, 27, 17, 24, 15, 29, 21, 12, 26, 18]

  function toggle() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  return (
    <div className="voice-note">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDuration(Math.round(audioRef.current?.duration || 0))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" className="voice-play" onClick={toggle} aria-label="Play voice note">
        <PlayIcon paused={!playing} />
      </button>
      <div className="voice-body">
        <div className="voice-wave" aria-hidden="true">
          {bars.map((height, index) => (
            <span key={index} style={{ height }} />
          ))}
        </div>
        <div className="voice-meta">
          <span>{time}</span>
          <span>{duration ? formatSeconds(duration) : '0:00'}</span>
        </div>
      </div>
    </div>
  )
}

export default function ChatWindow({ conversation, onBack }) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const channelRef = useRef(null)
  const recorderRef = useRef(null)
  const recordChunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordStreamRef = useRef(null)

  async function loadMessages() {
    const data = await fetchMessages(conversation.id)
    setMessages(data)
  }

  async function notifyMessageChange() {
    await channelRef.current?.send({
      type: 'broadcast',
      event: 'message-changed',
      payload: { conversationId: conversation.id, at: Date.now() },
    })
  }

  useEffect(() => {
    let cancelled = false

    async function loadConversationMessages() {
      const data = await fetchMessages(conversation.id)
      if (!cancelled) setMessages(data)
    }

    loadConversationMessages()

    const channel = supabase
      .channel(`messages:${conversation.id}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'message-changed' }, () => loadConversationMessages())
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => loadConversationMessages()
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [conversation.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      window.clearInterval(recordTimerRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recordStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function handleSend(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || recording) return

    setText('')
    await sendMessage({ conversationId: conversation.id, senderId: user.id, content })
    await loadMessages()
    await notifyMessageChange()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const url = await uploadChatImage(file, user.id)
      await sendMessage({ conversationId: conversation.id, senderId: user.id, imageUrl: url })
      await loadMessages()
      await notifyMessageChange()
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function sendVoiceNote(chunks, type) {
    if (!chunks.length) return

    setUploading(true)
    try {
      const audioUrl = await uploadChatAudio(new Blob(chunks, { type }), user.id)
      await sendMessage({ conversationId: conversation.id, senderId: user.id, audioUrl })
      await loadMessages()
      await notifyMessageChange()
    } finally {
      setUploading(false)
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = getAudioMimeType()
    const options = mimeType ? { mimeType } : undefined
    const recorder = new MediaRecorder(stream, options)

    recordChunksRef.current = []
    recordStreamRef.current = stream
    recorderRef.current = recorder

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) recordChunksRef.current.push(event.data)
    })

    recorder.addEventListener('stop', () => {
      const chunks = recordChunksRef.current
      const type = recorder.mimeType || 'audio/webm'

      recordStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordStreamRef.current = null
      recorderRef.current = null
      recordChunksRef.current = []
      window.clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
      setRecording(false)
      setRecordSeconds(0)

      sendVoiceNote(chunks, type)
    })

    recorder.start()
    setRecording(true)
    setRecordSeconds(0)
    recordTimerRef.current = window.setInterval(() => {
      setRecordSeconds((value) => value + 1)
    }, 1000)
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function handleRecordClick() {
    if (recording) {
      stopRecording()
      return
    }

    try {
      await startRecording()
    } catch {
      setRecording(false)
      setRecordSeconds(0)
      recordStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordStreamRef.current = null
    }
  }

  return (
    <section className="chat-window">
      <header className="chat-header">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Retour">
          &lt;
        </button>
        <span>{conversationLabel(conversation, profile?.id)}</span>
        <div className="chat-header-actions">
          <button type="button" aria-label="Appel vocal">
            <PhoneIcon />
          </button>
          <button type="button" aria-label="Appel video">
            <VideoIcon />
          </button>
        </div>
      </header>

      <div className="messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={'message ' + (message.sender_id === user.id ? 'mine' : 'theirs')}
          >
            {conversation.is_group && message.sender_id !== user.id && (
              <span className="message-sender">{message.profiles?.username}</span>
            )}
            {message.image_url && (
              <img src={message.image_url} alt="" className="message-image" />
            )}
            {message.audio_url && (
              <VoiceNote src={message.audio_url} time={formatMessageTime(message.created_at)} />
            )}
            {message.content && <p>{message.content}</p>}
            {!message.audio_url && (
              <span className="message-time">
                {formatMessageTime(message.created_at)}
                {message.sender_id === user.id ? ' ✓✓' : ''}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="message-form" onSubmit={handleSend}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || recording}
          title="Envoyer une image"
        >
          +
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          hidden
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={recording ? `Recording ${formatSeconds(recordSeconds)}` : 'Ecrire un message...'}
          disabled={recording}
        />
        <button
          type="button"
          className={'record-btn' + (recording ? ' recording' : '')}
          onClick={handleRecordClick}
          disabled={uploading}
          title={recording ? 'Arreter et envoyer' : 'Note vocale'}
        >
          {recording ? 'Stop' : <MicIcon />}
        </button>
        <button type="submit" disabled={recording || uploading}>
          Envoyer
        </button>
      </form>
    </section>
  )
}
