import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../contexts/AuthContext';
import './auth.css';

export default function ResetPasswordPage() {
  const { previewTheme, theme } = useTheme();
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  const busy = status === 'loading';
  const canSubmit = useMemo(() => password.length >= 6 && confirm.length >= 6, [password, confirm]);

  useEffect(() => {
    setError(null);
  }, [setError]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const res = await updatePassword(password);
    if (res.success) {
      setInfo('Password updated. You can now return to the editor.');
    }
  };

  return (
    <div
      className="authPage"
      style={{
        backgroundColor: previewTheme.backgroundColor,
        color: previewTheme.textColor,
        '--app-border-color': previewTheme.borderColor,
      } as React.CSSProperties}
      data-theme={theme}
    >
      <div className="authPageCard">
        <h1 className="authPageTitle">Reset password</h1>
        <p className="authPageSubtitle">Choose a new password for your account.</p>

        <form className="authPageForm" onSubmit={submit}>
          <label className="authLabel">
            New password
            <input
              type="password"
              className="modal-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              disabled={busy}
              required
            />
          </label>

          <label className="authLabel">
            Confirm new password
            <input
              type="password"
              className="modal-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              disabled={busy}
              required
            />
          </label>

          {error && <div className="authMessage error" role="alert">{error}</div>}
          {info && <div className="authMessage info">{info}</div>}

          <div className="authPageActions">
            <button className="modal-button modal-button-confirm" type="submit" disabled={!canSubmit || busy}>
              {busy ? 'Working…' : 'Update password'}
            </button>
            <button
              type="button"
              className="modal-button modal-button-cancel"
              onClick={() => { window.location.href = '/'; }}
            >
              Back to editor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


