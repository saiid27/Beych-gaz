import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import NewConversationModal from './NewConversationModal'

function conversationLabel(conversation, currentUserId) {
  if (conversation.is_group) return conversation.name || 'Groupe'
  const other = conversation.conversation_participants.find(
    (p) => p.user_id !== currentUserId
  )
  return other?.profiles?.username || 'Utilisateur'
}

export default function Sidebar({ conversations, activeId, onSelect, onCreated }) {
  const { profile, signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="me">{profile?.username}</span>
        <div className="sidebar-actions">
          <button type="button" onClick={() => setShowModal(true)} title="Nouvelle discussion">
            +
          </button>
          <button type="button" onClick={signOut} title="Déconnexion" className="secondary">
            ⏻
          </button>
        </div>
      </div>

      <ul className="conversation-list">
        {conversations.length === 0 && (
          <li className="empty-hint">Aucune discussion. Clique sur + pour en démarrer une.</li>
        )}
        {conversations.map((c) => (
          <li
            key={c.id}
            className={c.id === activeId ? 'active' : ''}
            onClick={() => onSelect(c.id)}
          >
            <div className="avatar">{conversationLabel(c, profile?.id)[0]?.toUpperCase()}</div>
            <span>{conversationLabel(c, profile?.id)}</span>
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
