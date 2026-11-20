import React from 'react';

/**
 * The one on/off switch: Settings › Modules and Settings › Preferences ("Learn as you go") both use it, so
 * the two rows look and behave alike (UX audit 2026-11-20 P1-8).
 *
 * A real `<button role="switch">` with an accessible name. The visible track is 44×24; the button
 * itself is at least 44×44 so the touch target meets the house rule without changing the look. The
 * thumb slides with `transform` through `.fp-switch-thumb`, which drops the transition under reduced
 * motion. Core edition: no motion kit.
 */
export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name, when no visible label is referenced with `labelledBy`. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  /** True while a save is in flight: the switch is disabled and shows a wait cursor. */
  busy?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, labelledBy, describedBy, busy = false }) => (
  <button
    type="button"
    role="switch"
    data-switch="fp"
    aria-checked={checked}
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onClick={() => onChange(!checked)}
    disabled={busy}
    style={{
      minWidth: 44, minHeight: 44, padding: 0, border: 'none', background: 'transparent', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
    }}
  >
    <span aria-hidden="true" style={{
      width: 44, height: 24, borderRadius: 12, position: 'relative', display: 'block',
      background: checked ? 'var(--g500)' : 'var(--border-light)',
    }}>
      <span className="fp-switch-thumb" style={{
        position: 'absolute', top: 3, left: 3, borderRadius: '50%', width: 18, height: 18, background: '#fff',
        transform: checked ? 'translateX(20px)' : 'translateX(0)',
      }} />
    </span>
  </button>
);

export default Switch;
