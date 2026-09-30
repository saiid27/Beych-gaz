import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(phone, password)
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
        <h1>تسجيل الدخول</h1>
        <p className="auth-subtitle">ادخل رقم الهاتف وكلمة المرور للمتابعة.</p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          رقم الهاتف
          <input
            type="tel"
            inputMode="numeric"
            placeholder="مثال: 00000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            placeholder="اكتب كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'جاري الدخول...' : 'دخول'}
        </button>
        <p className="auth-switch">
          ليس لديك حساب؟ <Link to="/signup">إنشاء حساب</Link>
        </p>
      </form>
    </div>
  )
}
