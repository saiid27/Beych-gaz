import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signUp(phone, password)
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">BG</div>
        <div className="auth-brand">Bych Gaz</div>
        <h1>إنشاء حساب</h1>
        <p className="auth-subtitle">سجل برقم الهاتف وكلمة مرور فقط.</p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          رقم الهاتف
          <input
            type="tel"
            inputMode="numeric"
            placeholder="مثال: 34605765"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            placeholder="6 أحرف على الأقل"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
        </button>
        <p className="auth-switch">
          لديك حساب؟ <Link to="/login">تسجيل الدخول</Link>
        </p>
      </form>
    </div>
  )
}
