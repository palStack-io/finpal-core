import React, { useState } from 'react';
import { Backpack, Coins, Medal, Mountain } from 'lucide-react';

import { DataStatement } from '../privacy/DataStatement';
import { useDataStatement } from '../../hooks/useDataStatement';
import { moduleService } from '../../services/moduleService';
import type { OrientationPanel } from '../../services/onboardingService';

/**
 * The four orienting screens, before the four configuring ones.
 *
 * *** ORIENT THEN CONFIGURE — one of the five onboarding decisions taken
 * 2026-09-12. *** The wizard that existed asked for a currency, a timezone,
 * notification preferences and an emoji before saying what finPal was for. A
 * user who has just signed up does not yet know why any of those matter, and
 * step 3 here is the screen the whole flow exists for: four words —
 * mountains, coins, gear, badges — that mean four different things and would
 * otherwise be learned by guessing.
 *
 * *** EVERY STRING COMES FROM THE SERVER. *** `GET /api/v1/modules/catalog`,
 * the same payload the module step and the data statement use. Copy inside a
 * client can only be corrected by shipping it, and mobile ships through a store
 * review with iOS EAS withheld — so the prose lives in
 * `src/services/onboarding/copy.py` and this file holds none of it. If the
 * fetch fails this renders nothing and `onDone` is offered immediately, because
 * a first-run screen that cannot load its own copy must not become a wall
 * between a new user and the app.
 *
 * *** A DOT STRIP, NOT "STEP 2 OF 4". *** Spec §10.5: a wizard counter is still
 * a denominator finPal chose, and the screen that prints *"no score you did not
 * ask for"* must not carry one. The dots say where you are without printing a
 * fraction.
 */
const GLYPHS: Record<string, React.FC<{ size?: number; color?: string }>> = {
  Mountains: Mountain,
  Coins,
  Gear: Backpack,
  Badges: Medal,
};

const SCREENS = 4;

export const Orientation: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { catalog } = useDataStatement();
  const [screen, setScreen] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // No copy, no orientation. Handing the user a blank wizard would be worse
  // than dropping them into the configure steps they can actually complete.
  if (!catalog?.orientation) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <button onClick={onDone} style={primary}>Continue</button>
      </div>
    );
  }

  const copy = catalog.orientation;

  /**
   * *** THE TOGGLE WRITES `UserModulePreference` ("do you want to see it"), AND
   * NEVER `UserModuleAccess` ("may you"). *** Two tables, kept apart by owner
   * decision 2026-09-11: one is a user's choice and the other is an
   * entitlement, and collapsing them would let a preference look like a grant.
   * Modules arrive ON — "not now" is a toggle, not a wall.
   */
  const toggleModule = (slug: string) => {
    const turningOff = !hidden.includes(slug);
    setSaving(true);
    // *** THE SERVER RETURNS THE WHOLE HIDDEN LIST, SO NOTHING IS
    // RECONSTRUCTED HERE. *** Two places computing the same set is two chances
    // to disagree, and this one would disagree silently.
    moduleService
      .setVisible(slug, !turningOff)
      .then(setHidden)
      .catch(() => {
        // Leave the state alone rather than lie about a write that failed.
      })
      .finally(() => setSaving(false));
  };

  const next = () => (screen < SCREENS ? setScreen(screen + 1) : onDone());

  return (
    <div>
      <div style={{ minHeight: '360px' }}>
        {screen === 1 && (
          <div>
            <h2 style={heading}>{copy.welcome.heading}</h2>
            {copy.welcome.lines.map((line) => (
              <p key={line} style={body}>{line}</p>
            ))}
            {/* *** THE STATEMENT IS A PANEL ON WELCOME, NOT A SIXTH STEP. ***
                A wizard that grows a step to hold a promise reads as a consent
                gate. The operator caveat is NOT shown here — on first run the
                user has not yet decided whose server this is, so it would read
                as a disclaimer stapled to a promise; it lives in Settings. */}
            <div style={{ marginTop: '1.25rem' }}>
              <DataStatement compact onDarkShell />
            </div>
          </div>
        )}

        {screen === 2 && (
          <div>
            <h2 style={heading}>{copy.mountains.heading}</h2>
            {copy.mountains.lines.map((line) => (
              <p key={line} style={body}>{line}</p>
            ))}
            {/* Marked as examples on the server, and rendered with that label
                visible: a new user has no goals, and an unlabelled illustration
                reads as something finPal already knows about them. */}
            {copy.mountains.examples.map((example) => (
              <div key={example.text} style={exampleCard}>
                <span style={exampleLabel}>{example.label}</span>
                <p style={{ ...body, margin: 0 }}>{example.text}</p>
              </div>
            ))}
          </div>
        )}

        {screen === 3 && (
          <div>
            <h2 style={heading}>{copy.game.heading}</h2>
            <div style={panelGrid}>
              {copy.game.panels.map((panel: OrientationPanel) => {
                const Glyph = GLYPHS[panel.title];
                return (
                  <div key={panel.title} style={panelCard}>
                    {Glyph && <Glyph size={22} color={ACCENT} />}
                    <h3 style={panelTitle}>{panel.title}</h3>
                    <p style={panelQuestion}>{panel.question}</p>
                    <p style={{ ...body, margin: 0, fontSize: '0.875rem' }}>
                      {panel.answer}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Each of these is enforced structurally rather than by policy,
                which is what makes it safe to print. */}
            <ul style={{ margin: '1.25rem 0 0', paddingLeft: '1.1rem' }}>
              {copy.game.promises.map((promise) => (
                <li key={promise} style={{ ...body, marginBottom: '0.4rem' }}>
                  {promise}
                </li>
              ))}
            </ul>
          </div>
        )}

        {screen === 4 && (
          <div>
            <h2 style={heading}>{copy.modules.heading}</h2>
            {copy.modules.lines.map((line) => (
              <p key={line} style={body}>{line}</p>
            ))}
            {catalog.modules.map((module) => {
              const on = !hidden.includes(module.slug);
              return (
                <div key={module.slug} style={moduleCard}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={panelTitle}>{module.name}</h3>
                    <p style={{ ...body, margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                      {module.intro}
                    </p>
                    <p style={{ ...panelQuestion, marginTop: '0.4rem' }}>
                      Gives you: {module.gives}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleModule(module.slug)}
                    disabled={saving}
                    aria-pressed={on}
                    style={{
                      ...toggle,
                      background: on ? '#15803d' : 'transparent',
                      color: on ? '#ffffff' : BODY,
                    }}
                  >
                    {on ? 'On' : 'Not now'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The dot strip. `aria-label` carries the position for a screen reader,
          which needs the number even though the screen must not print one. */}
      <div
        role="group"
        aria-label={`Screen ${screen} of ${SCREENS}`}
        style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', margin: '1.5rem 0' }}
      >
        {Array.from({ length: SCREENS }, (_, i) => (
          <span
            key={i}
            style={{
              width: i + 1 === screen ? '1.5rem' : '0.5rem',
              height: '0.5rem',
              borderRadius: '9999px',
              background: i + 1 <= screen ? ACCENT : CARD_LINE,
              transition: 'width 0.2s ease',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button
          onClick={() => setScreen(screen - 1)}
          disabled={screen === 1}
          style={{ ...secondary, opacity: screen === 1 ? 0.4 : 1 }}
        >
          Back
        </button>
        <button onClick={next} style={primary}>
          {screen === SCREENS ? 'Set finPal up' : 'Next'}
        </button>
      </div>
    </div>
  );
};


/**
 * *** THE DARK-SHELL PALETTE, MEASURED ON THIS PAGE'S OWN CARD — NOT THE THEME
 * TOKENS. *** `Onboarding.tsx` paints a fixed `#0f172a → #1e293b` gradient in
 * BOTH themes, so `var(--text-primary)` here is 1.08:1 in light and
 * `var(--text-muted)` is 2.59:1 — that is D-212, found by measuring this shell
 * while building these screens rather than after shipping them.
 *
 * Measured against the composited card (`#1b2537`) and the inner translucent
 * card (`#242e40`):
 *   #ffffff  15.37 / 13.64   headings
 *   #cbd5e1  10.35 /  9.19   body
 *   #94a3b8   5.99 /  5.32   questions, labels
 *   #86efac      — /  9.71   the accent, also used for non-text glyphs
 */
const INK = '#ffffff';
const BODY = '#cbd5e1';
const MUTED = '#94a3b8';
const ACCENT = '#86efac';
const CARD_BG = 'rgba(148, 163, 184, 0.08)';
const CARD_LINE = 'rgba(148, 163, 184, 0.22)';

const heading: React.CSSProperties = {
  fontSize: '1.5rem', fontWeight: 700, color: INK,
  margin: '0 0 0.75rem', lineHeight: 1.25,
};
const body: React.CSSProperties = {
  fontSize: '0.95rem', lineHeight: 1.6, color: BODY,
  margin: '0 0 0.75rem',
};
const exampleCard: React.CSSProperties = {
  border: `1px solid ${CARD_LINE}`, borderRadius: '0.75rem',
  padding: '0.85rem 1rem', marginBottom: '0.6rem',
  background: CARD_BG,
};
const exampleLabel: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.7rem', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: MUTED, marginBottom: '0.35rem',
};
const panelGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: '0.75rem',
};
const panelCard: React.CSSProperties = {
  border: `1px solid ${CARD_LINE}`, borderRadius: '0.75rem',
  padding: '1rem', background: CARD_BG,
};
const panelTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 700, color: INK,
  margin: '0.5rem 0 0.15rem',
};
const panelQuestion: React.CSSProperties = {
  fontSize: '0.8rem', fontStyle: 'italic', color: MUTED,
  margin: '0 0 0.4rem',
};
const moduleCard: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '1rem',
  border: `1px solid ${CARD_LINE}`, borderRadius: '0.75rem',
  padding: '1rem', marginBottom: '0.6rem', background: CARD_BG,
};
const toggle: React.CSSProperties = {
  border: `1px solid ${CARD_LINE}`, borderRadius: '9999px',
  padding: '0.4rem 0.9rem', fontSize: '0.85rem', fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const primary: React.CSSProperties = {
  padding: '0.7rem 1.4rem', borderRadius: '0.6rem', border: 'none',
  background: '#15803d', color: '#ffffff', fontWeight: 600,
  cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  padding: '0.7rem 1.4rem', borderRadius: '0.6rem',
  border: `1px solid ${CARD_LINE}`, background: 'transparent',
  color: INK, fontWeight: 600, cursor: 'pointer',
};

export default Orientation;
