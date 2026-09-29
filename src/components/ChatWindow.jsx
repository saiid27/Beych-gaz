import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchMessages, sendMessage, uploadChatImage } from '../lib/chat'
import { conversationLabel } from './Sidebar'

export default function ChatWindow({ conversation, onBack }) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const channelRef = useRef(null)

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

  async function handleSend(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
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

  return (
    <section className="chat-window">
      <header className="chat-header">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Retour">
          ‹
        </button>
        <span>{conversationLabel(conversation, profile?.id)}</span>
      </header>

      <div className="messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={'message ' + (m.sender_id === user.id ? 'mine' : 'theirs')}
          >
            {conversation.is_group && m.sender_id !== user.id && (
              <span className="message-sender">{m.profiles?.username}</span>
            )}
            {m.image_url && <img src={m.image_url} alt="" className="message-image" />}
            {m.content && <p>{m.content}</p>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="message-form" onSubmit={handleSend}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Envoyer une image"
        >
          📎
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
          placeholder="Écrire un message…"
        />
        <button type="submit">Envoyer</button>
      </form>
    </section>
  )
}
