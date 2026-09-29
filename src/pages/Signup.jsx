import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    const { data, error } = await signUp(email, password, username)
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    if (!data.session) {
      setInfo('Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.')
      return
    }
    navigate('/')
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Créer un compte</h1>
        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}
        <label>
          Nom d'utilisateur
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Création…' : "S'inscrire"}
        </button>
        <p className="auth-switch">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </form>
    </div>
  )
}
