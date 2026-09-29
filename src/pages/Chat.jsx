import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchMyConversations } from '../lib/chat'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'

export default function Chat() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)

  async function reload(selectId) {
    const data = await fetchMyConversations(user.id)
    setConversations(data)
    if (selectId) setActiveId(selectId)
  }

  useEffect(() => {
    reload()

    const intervalId = window.setInterval(() => {
      reload()
    }, 1000)

    return () => window.clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  const active = conversations.find((c) => c.id === activeId)

  return (
    <div className={'chat-app ' + (active ? 'has-active-chat' : 'show-conversations')}>
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
          <p>Sélectionne une discussion ou démarres-en une nouvelle.</p>
        </section>
      )}
    </div>
  )
}
