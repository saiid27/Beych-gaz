import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import NewConversationModal from './NewConversationModal'

function conversationLabel(conversation, currentUserId) {
  if (conversation.is_group) return conversation.name || 'مجموعة'
  const other = conversation.conversation_participants.find((p) => p.user_id !== currentUserId)
  return other?.profiles?.username || 'مستخدم'
}

export default function Sidebar({ conversations, activeId, onSelect, onCreated }) {
  const { profile, signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Bych Gaz</div>
      <div className="sidebar-header">
        <span className="me">{profile?.username}</span>
        <div className="sidebar-actions">
          <button type="button" onClick={() => setShowModal(true)} title="محادثة جديدة">
            +
          </button>
          <button type="button" onClick={signOut} title="تسجيل الخروج" className="secondary">
            ⏻
          </button>
        </div>
      </div>

      <ul className="conversation-list">
        {conversations.length === 0 && (
          <li className="empty-hint">لا توجد محادثات. اضغط + لبدء محادثة جديدة.</li>
        )}
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            className={conversation.id === activeId ? 'active' : ''}
            onClick={() => onSelect(conversation.id)}
          >
            <div className="avatar">
              {conversationLabel(conversation, profile?.id)[0]?.toUpperCase()}
            </div>
            <span>{conversationLabel(conversation, profile?.id)}</span>
          </li>
        ))}
      </ul>

      {showModal && (
        <NewConversationModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false)
            onCreated(id)
          }}
        />
      )}
    </aside>
  )
}

export { conversationLabel }
