import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { useToast } from '../../contexts/ToastContext';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * The one setup question for "Learn as you go". Each answer saves at once through the profile
 * update (the onboarding endpoint does not take this field) and refreshes the cached user.
 * Left unanswered, the server reads NULL as on.
 */
export const LearnQuestion: React.FC<{
  chosen: boolean | null;
  onChosen: (value: boolean) => void;
}> = ({ chosen, onChosen }) => {
  const updateUser = useAuthStore((s) => s.updateUser);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const choose = async (value: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await userService.updateProfile({ learn_as_you_go: value });
      updateUser({ learn_as_you_go: saved?.learn_as_you_go ?? value });
      onChosen(value);
    } catch (err) {
      showToast(apiErrorMessage(err, "We couldn't save that. You can change it any time in Settings."), 'error');
    } finally {
      setSaving(false);
    }
  };

  const option = (value: boolean, label: string) => {
    const selected = chosen === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={saving}
        onClick={() => choose(value)}
        style={{
          padding: '0.75rem 1.25rem', borderRadius: '0.75rem', cursor: saving ? 'wait' : 'pointer',
          fontSize: '0.9375rem', fontWeight: 600, color: '#ffffff',
          border: selected ? '2px solid #15803d' : '2px solid #64748b',
          background: selected ? 'rgba(21, 128, 61, 0.1)' : 'rgba(15, 23, 42, 0.5)',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
        Want finPal to explain your numbers as you go?
      </h2>
      <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.5rem' }}>
        You can change this any time in Settings.
      </p>
      <div role="radiogroup" aria-label="Learn as you go" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {option(true, 'Yes, show me')}
        {option(false, 'No, just the numbers')}
      </div>
    </div>
  );
};

export default LearnQuestion;
