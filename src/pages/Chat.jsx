import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { fetchAllConversations, fetchMyConversations } from '../lib/chat'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'
import CameraCheckPanel from '../components/CameraCheckPanel'
import CameraRequestListener from '../components/CameraRequestListener'

export default function Chat() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)

  async function reload(selectId) {
    const data = user.isAdmin ? await fetchAllConversations() : await fetchMyConversations(user.id)
    setConversations(data)
    if (selectId) setActiveId(selectId)
  }

  useEffect(() => {
    reload()

    const channel = supabase
      .channel(`conversation-list:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${user.id}`,
        },
        () => reload()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => reload()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  const active = conversations.find((c) => c.id === activeId)

  return (
    <div
      className={
        'chat-app ' +
        (active ? 'has-active-chat' : 'show-conversations') +
        (user.isAdmin ? ' admin-mode' : '')
      }
    >
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onCreated={(id) => reload(id)}
      />
      {active ? (
        <ChatWindow conversation={active} onBack={() => setActiveId(null)} />
      ) : (
        <section className="chat-window empty-state">
          {user.isAdmin ? (
            <CameraCheckPanel />
          ) : (
            <p>Sélectionne une discussion ou démarres-en une nouvelle.</p>
          )}
        </section>
      )}
      <CameraRequestListener />
    </div>
  )
}
