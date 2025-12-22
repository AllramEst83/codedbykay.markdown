import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../contexts/AuthContext';
import './auth.css';

export default function ChangePasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme } = useTheme();
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
    if (!isOpen) return;
    setPassword('');
    setConfirm('');
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

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const res = await updatePassword(password);
    if (res.success) {
      setInfo('Password updated.');
      setTimeout(onClose, 700);
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
            <div className="authTitle">Change password</div>
            <button type="button" className="authClose" onClick={onClose} aria-label="Close change password modal">
              ×
            </button>
          </div>

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

          <div className="modal-actions">
            <button type="button" className="modal-button modal-button-cancel" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="modal-button modal-button-confirm" type="submit" disabled={!canSubmit || busy}>
              {busy ? 'Working…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


