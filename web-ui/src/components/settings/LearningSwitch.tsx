import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { useToast } from '../../contexts/ToastContext';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * "Learn as you go": the one switch for the Dashboard lessons and the "Why?" cards. Off keeps what
 * was already learned. Saves through the profile update (no optimistic flip: the switch shows what
 * the server accepted) and refreshes the cached user; the cards refetch when the Dashboard mounts.
 */
export const LearningSwitch: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const on = user?.learn_as_you_go !== false;

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await userService.updateProfile({ learn_as_you_go: !on });
      updateUser({ learn_as_you_go: saved?.learn_as_you_go ?? !on });
    } catch (err) {
      showToast(apiErrorMessage(err, "We couldn't save that preference. Try again in a moment."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 12,
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
    }}>
      <div style={{ flex: 1 }}>
        <div id="learn-as-you-go-title" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Learn as you go
        </div>
        <div id="learn-as-you-go-sub" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Short lessons from your own numbers on the Dashboard, and "Why?" next to figures. Turn it off any time; what you already learned is kept.
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="learn-as-you-go-title"
        aria-describedby="learn-as-you-go-sub"
        onClick={toggle}
        aria-disabled={saving}
        style={{
          width: 44, height: 24, borderRadius: 12, padding: 0, border: 'none', flexShrink: 0,
          cursor: saving ? 'wait' : 'pointer', background: on ? 'var(--g500)' : 'var(--border-light)',
          position: 'relative', opacity: saving ? 0.6 : 1,
        }}
      >
        <div className="fp-switch-thumb" style={{
          position: 'absolute', top: 3, left: 3, borderRadius: '50%', width: 18, height: 18, background: '#fff',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
        }} />
      </button>
    </div>
  );
};

export default LearningSwitch;
