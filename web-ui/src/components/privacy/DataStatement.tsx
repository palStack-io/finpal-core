import React from 'react';

import { useDataStatement } from '../../hooks/useDataStatement';

/**
 * *** IT IS A STATEMENT, WHICH IS THE OWNER'S OWN WORD FOR IT. *** (2026-09-14:
 * *"can we also make sure the privacy is more of a statement?"*) So: a
 * declarative heading at the size of a page title, three short declarative
 * lines, and nothing else. No padlock icon, no shield, no "bank-grade" — this
 * project's voice rules already say the honest version is stronger than the
 * marketing version, and security theatre reads as something to be suspicious
 * of.
 *
 * *** IF THE COPY CANNOT BE FETCHED, THIS RENDERS NOTHING. *** Not a spinner,
 * not a fallback sentence. A promise about a user's financial data is the one
 * string that must never be a client's guess, and a hardcoded fallback here
 * would defeat the reason the prose lives on the server at all.
 */
export const DataStatement: React.FC<{
  /**
   * *** THE ONBOARDING SHELL IS A FIXED DARK GRADIENT IN BOTH THEMES (D-212),
   * SO THE THEME TOKENS ARE WRONG THERE. *** Without this, the panel rendered
   * near-white with dark ink on a dark card in LIGHT theme: legible, and
   * visually a hole punched in the screen. These four values are measured on
   * that shell — #ffffff 15.37:1, #cbd5e1 10.35:1, #94a3b8 5.99:1.
   */
  onDarkShell?: boolean;
  /** Settings shows the operator caveat; onboarding does not — on first run the
   *  user has not yet decided whose server this is, and the sentence reads as a
   *  disclaimer stapled to a promise. */
  showOperatorNote?: boolean;
  compact?: boolean;
}> = ({ showOperatorNote = false, compact = false, onDarkShell = false }) => {
  const { data } = useDataStatement();
  if (!data) return null;

  return (
    <section
      aria-label="Where your data lives"
      style={{
        padding: compact ? '18px 20px' : '24px 26px',
        background: onDarkShell ? 'rgba(148, 163, 184, 0.08)' : 'var(--surface-hover)',
        border: onDarkShell
          ? '1px solid rgba(148, 163, 184, 0.22)'
          : '1px solid var(--border-light)',
        borderRadius: '12px',
        marginBottom: '24px',
      }}
    >
      <h3
        style={{
          fontSize: compact ? '18px' : '21px',
          fontWeight: 700,
          color: onDarkShell ? '#ffffff' : 'var(--text-primary)',
          margin: '0 0 12px',
          lineHeight: 1.25,
        }}
      >
        {data.heading}
      </h3>
      {data.lines.map((line) => (
        <p
          key={line}
          style={{
            fontSize: '14.5px',
            lineHeight: 1.6,
            color: onDarkShell ? '#cbd5e1' : 'var(--text-secondary)',
            margin: '0 0 10px',
          }}
        >
          {line}
        </p>
      ))}
      {showOperatorNote && (
        <p
          style={{
            fontSize: '13px',
            lineHeight: 1.6,
            // *** `--text-muted` AND `--text-secondary` ARE THE SAME TOKEN
            // (both `--kt-soft`), SO THE QUIETNESS HERE IS SIZE AND A RULE,
            // NOT COLOUR. *** Written down so nobody "fixes" the apparent
            // duplication by inventing a third token: measured 5.45:1 light and
            // 6.58:1 dark on `--surface-hover`, both AA, and a genuinely
            // lighter grey would not be.
            color: onDarkShell ? '#94a3b8' : 'var(--text-muted)',
            margin: '14px 0 0',
            paddingTop: '14px',
            borderTop: onDarkShell
              ? '1px solid rgba(148, 163, 184, 0.22)'
              : '1px solid var(--border-light)',
          }}
        >
          {data.operator_note}
        </p>
      )}
    </section>
  );
};

export default DataStatement;
