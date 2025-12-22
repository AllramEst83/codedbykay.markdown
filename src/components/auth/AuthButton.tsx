import { useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';
import { getSupabaseClient, isAuthConfigured } from '../../supabase/client';
import AuthModal from './AuthModal';
import ChangePasswordModal from './ChangePasswordModal';
import './auth.css';

export default function AuthButton() {
  const { showModal } = useModal();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAuthed = status === 'authenticated' && Boolean(user);
  const email = useMemo(() => user?.email ?? null, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout('global');
  };

  const handleDeleteAccount = async () => {
    setMenuOpen(false);
    if (!email) return;

    const typed = await showModal({
      type: 'prompt',
      title: 'Delete account',
      message: `This will permanently delete your account and all cloud data.\n\nType your email to confirm:`,
      defaultValue: '',
      placeholder: email,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!typed) return;
    if (typed.trim().toLowerCase() !== email.trim().toLowerCase()) {
      await showModal({
        type: 'alert',
        title: 'Email did not match',
        message: 'Account deletion cancelled.',
        confirmText: 'OK',
      });
      return;
    }

    if (!isAuthConfigured) {
      await showModal({
        type: 'alert',
        title: 'Auth not configured',
        message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.',
        confirmText: 'OK',
      });
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.functions.invoke('delete-user');
      if (error) {
        throw error;
      }
      // After deletion, global logout can 403 because the user no longer exists.
      await logout('local');
      await showModal({
        type: 'alert',
        title: 'Account deleted',
        message: 'Your account has been deleted.',
        confirmText: 'OK',
      });
    } catch (err) {
      console.error('Failed to delete account', err);
      await showModal({
        type: 'alert',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Failed to delete account.',
        confirmText: 'OK',
      });
    }
  };

  if (!isAuthConfigured) {
    return (
      <button className="tab-action" disabled title="Supabase auth is not configured">
        <UserIcon size={16} />
        <span className="authActionText">Auth</span>
      </button>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <button
          className="tab-action"
          onClick={() => setIsAuthModalOpen(true)}
          aria-label="Open login"
          title="Login"
        >
          <LogIn size={16} />
          <span className="authActionText">Login</span>
        </button>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="authMenu" ref={menuRef}>
        <button
          className="tab-action"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Open user menu"
          title={email ?? 'Account'}
        >
          <UserIcon size={16} />
          <span className="authActionText authEmail">{email ?? 'Account'}</span>
        </button>

        {menuOpen && (
          <div className="authDropdown" role="menu" aria-label="Account menu">
            <div className="authDropdownHeader">
              <div className="authDropdownLabel">Signed in as</div>
              <div className="authDropdownEmail">{email}</div>
            </div>
            <button className="authDropdownItem" onClick={() => { setMenuOpen(false); setIsChangePasswordOpen(true); }}>
              Change password
            </button>
            <button className="authDropdownItem" onClick={handleLogout}>
              Logout
            </button>
            <div className="authDropdownDivider" />
            <button className="authDropdownItem danger" onClick={handleDeleteAccount}>
              Delete account
            </button>
          </div>
        )}
      </div>

      <ChangePasswordModal isOpen={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} />
    </>
  );
}


