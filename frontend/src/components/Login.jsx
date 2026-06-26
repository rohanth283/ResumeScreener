import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { EyeIcon, EyeOffIcon } from './Icons';
import './Login.css';

export default function Login({ apiBaseUrl, onAuthSuccess }) {
  const [viewMode, setViewMode] = useState('login'); // 'login' | 'signup' | 'forgot-password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = viewMode === 'login' ? '/auth/login' : '/auth/signup';
    const payload = viewMode === 'login' 
      ? { email, password } 
      : { email, password, name };

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed. Please try again.');
      }

      onAuthSuccess({ token: data.access_token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to request password reset link.');
      }

      setSuccessMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Google authentication failed.');
      }

      onAuthSuccess({ token: data.access_token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h2>Smart Resume Screener</h2>
          <p>
            {viewMode === 'forgot-password'
              ? 'Request a link to reset your password'
              : viewMode === 'login'
              ? 'Sign in to your account'
              : 'Create an account to get started'}
          </p>
        </div>

        {viewMode !== 'forgot-password' && (
          <div className="tabs">
            <button 
              type="button"
              className={`tab-btn ${viewMode === 'login' ? 'active' : ''}`}
              onClick={() => { setViewMode('login'); setError(null); setSuccessMessage(null); }}
            >
              Log In
            </button>
            <button 
              type="button"
              className={`tab-btn ${viewMode === 'signup' ? 'active' : ''}`}
              onClick={() => { setViewMode('signup'); setError(null); setSuccessMessage(null); }}
            >
              Sign Up
            </button>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        {viewMode === 'forgot-password' ? (
          <form onSubmit={handleForgotPassword}>
            <div className="form-group">
              <label htmlFor="auth-email">Email Address</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Sending link...' : 'Send Reset Link'}
            </button>

            <button 
              type="button" 
              className="back-login-btn" 
              onClick={() => { setViewMode('login'); setError(null); setSuccessMessage(null); }}
              disabled={loading}
            >
              ← Back to Log In
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmailAuth}>
            {viewMode === 'signup' && (
              <div className="form-group">
                <label htmlFor="reg-name">Full Name</label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="auth-email">Email Address</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label htmlFor="auth-password">Password</label>
                {viewMode === 'login' && (
                  <button 
                    type="button" 
                    className="forgot-pwd-link"
                    onClick={() => { setViewMode('forgot-password'); setError(null); setSuccessMessage(null); }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="input-wrapper">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Processing...' : viewMode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
        )}

        {viewMode !== 'forgot-password' && (
          <>
            <div className="divider">or continue with</div>

            <div className="google-auth-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google Authentication failed.')}
                theme="filled_blue"
                shape="rectangular"
                text="continue_with"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
