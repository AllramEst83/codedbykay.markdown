import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../contexts/AuthContext';
import './auth.css';

type Mode = 'login' | 'register' | 'forgot';

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  const busy = status === 'loading';
  const canSubmit = useMemo(() => {
    if (mode === 'forgot') return email.trim().length > 3;
    if (mode === 'login') return email.trim().length > 3 && password.length >= 1;
    return email.trim().length > 3 && password.length >= 6 && confirmPassword.length >= 6;
  }, [mode, email, password, confirmPassword]);

  useEffect(() => {
    if (!isOpen) return;
    setMode('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setInfo(null);
    setError(null);
  }, [isOpen, setError]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfo(null);
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (mode === 'login') {
      const res = await login(email.trim(), password);
      if (res.success) onClose();
      return;
    }

    if (mode === 'register') {
      const res = await signup(email.trim(), password);
      if (res.success) onClose();
      return;
    }

    const res = await resetPassword(email.trim());
    if (res.success) {
      setInfo('Check your email for a password reset link.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-container authModalContainer" data-theme={theme}>
        <form className="modal-form authModalForm" onSubmit={submit}>
          <div className="authHeader">
            <div className="authTabs" role="tablist" aria-label="Authentication">
              <button
                type="button"
                className={`authTab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => { setMode('login'); setInfo(null); setError(null); }}
                disabled={busy}
              >
                Login
              </button>
              <button
                type="button"
                className={`authTab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => { setMode('register'); setInfo(null); setError(null); }}
                disabled={busy}
              >
                Register
              </button>
            </div>

            <button type="button" className="authClose" onClick={onClose} aria-label="Close auth modal">
              ×
            </button>
          </div>

          <div className="authTitle">
            {mode === 'forgot' ? 'Reset your password' : mode === 'login' ? 'Welcome back' : 'Create your account'}
          </div>

          <label className="authLabel">
            Email
            <input
              type="email"
              className="modal-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
              required
            />
          </label>

          {mode !== 'forgot' && (
            <label className="authLabel">
              Password
              <input
                type="password"
                className="modal-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                disabled={busy}
                required
              />
            </label>
          )}

          {mode === 'register' && (
            <label className="authLabel">
              Confirm password
              <input
                type="password"
                className="modal-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                disabled={busy}
                required
              />
            </label>
          )}

          {error && <div className="authMessage error" role="alert">{error}</div>}
          {info && <div className="authMessage info">{info}</div>}

          <div className="modal-actions authActions">
            {mode !== 'forgot' && (
              <button
                type="button"
                className="authLink"
                onClick={() => { setMode('forgot'); setInfo(null); setError(null); }}
                disabled={busy}
              >
                Forgot password?
              </button>
            )}
            {mode === 'forgot' && (
              <button
                type="button"
                className="authLink"
                onClick={() => { setMode('login'); setInfo(null); setError(null); }}
                disabled={busy}
              >
                Back to login
              </button>
            )}
            <button className="modal-button modal-button-confirm" type="submit" disabled={!canSubmit || busy}>
              {busy ? 'Working…' : mode === 'forgot' ? 'Send reset link' : mode === 'login' ? 'Login' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


