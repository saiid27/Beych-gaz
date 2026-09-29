import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createConversation, findDirectConversation, searchProfiles } from '../lib/chat'

export default function NewConversationModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSearch(value) {
    setQuery(value)
    if (value.trim().length === 0) {
      setResults([])
      return
    }
    const data = await searchProfiles(value.trim(), user.id)
    setResults(data)
  }

  function toggleSelect(profile) {
    setSelected((prev) =>
      prev.some((p) => p.id === profile.id)
        ? prev.filter((p) => p.id !== profile.id)
        : [...prev, profile]
    )
  }

  async function handleCreate() {
    if (selected.length === 0) return
    setLoading(true)
    try {
      const isGroup = selected.length > 1
      let conversationId

      if (!isGroup) {
        conversationId = await findDirectConversation(user.id, selected[0].id)
      }

      if (!conversationId) {
        const conversation = await createConversation({
          createdBy: user.id,
          memberIds: selected.map((p) => p.id),
          isGroup,
          name: isGroup ? groupName || selected.map((p) => p.username).join(', ') : null,
        })
        conversationId = conversation.id
      }

      onCreated(conversationId)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle discussion</h2>
        <input
          type="text"
          placeholder="Rechercher un utilisateur…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />

        {selected.length > 0 && (
          <div className="selected-chips">
            {selected.map((p) => (
              <span key={p.id} className="chip" onClick={() => toggleSelect(p)}>
                {p.username} ✕
              </span>
            ))}
          </div>
        )}

        {selected.length > 1 && (
          <input
            type="text"
            placeholder="Nom du groupe (optionnel)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        )}

        <ul className="user-results">
          {results.map((p) => (
            <li
              key={p.id}
              className={selected.some((s) => s.id === p.id) ? 'selected' : ''}
              onClick={() => toggleSelect(p)}
            >
              {p.username}
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" disabled={selected.length === 0 || loading} onClick={handleCreate}>
            {loading ? 'Création…' : 'Démarrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
