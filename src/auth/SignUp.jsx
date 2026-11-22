import { useState } from 'react'
import { api } from '../api'
import GoogleSignInButton from './GoogleSignInButton.jsx'

export default function SignUp({ navigate, onGoogleLogin }) {
  const [values, setValues] = useState({ full_name: '', email: '', password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (values.password !== values.confirm_password) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/api/register', new URLSearchParams({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
      }))
      if (response?.success !== true) throw new Error('The API did not confirm account creation.')
      window.sessionStorage.setItem('authSuccess', response.message || 'Account created. You can now sign in.')
      navigate('/auth/login')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const googleCredential = async (credential) => {
    setError('')
    setLoading(true)
    try {
      await onGoogleLogin(credential)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page">
    <section className="login-visual">
      <div className="login-brand"><button className="logo" onClick={() => navigate('/')} aria-label="DriveRent home"><span className="logo-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 21a10 10 0 1 1 20 0" /><path d="m16 21 5.5-6.5" /><circle cx="16" cy="21" r="1.6" fill="currentColor" stroke="none" /></svg></span><span className="logo-word">Drive<span>Rent</span></span></button></div>
      <span className="eyebrow light">JOIN DRIVERENT</span>
      <h1>Make room for<br /><em>new journeys.</em></h1>
      <p>Create your account to explore the available fleet.</p>
      <span className="login-side-note">YOUR JOURNEY, YOUR WAY.</span>
    </section>
    <form className="login-form signup-form" onSubmit={submit}>
      <div><span className="eyebrow">YOUR ACCOUNT</span><h2>Create account</h2><p>Enter your details to get started.</p></div>
      {error && <div className="error-message" role="alert">{error}</div>}
      <GoogleSignInButton onCredential={googleCredential} onError={setError} />
      <div className="auth-divider"><span>or use email</span></div>
      <label className="form-field"><span>Full name</span><input name="full_name" autoComplete="name" value={values.full_name} onChange={update} maxLength="150" required /></label>
      <label className="form-field"><span>Email address</span><input name="email" type="email" autoComplete="email" value={values.email} onChange={update} maxLength="255" required /></label>
      <label className="form-field"><span>Password</span><div className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={values.password} onChange={update} minLength="8" required /><button type="button" onClick={() => setShowPassword((show) => !show)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
      <label className="form-field"><span>Confirm password</span><input name="confirm_password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={values.confirm_password} onChange={update} minLength="8" required /></label>
      <button className="button button-primary login-submit" disabled={loading}>{loading ? <><span className="button-spinner" />Creating account…</> : 'Create account'}</button>
      <p className="auth-switch">Already have an account? <button type="button" onClick={() => navigate('/auth/login')}>Sign in</button></p>
    </form>
  </div>
}
