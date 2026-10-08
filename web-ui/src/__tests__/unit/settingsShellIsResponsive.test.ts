/**
 * D-313: Settings was a fixed 240px pane beside a content column with 56px of side padding, so
 * at 390px the content column was a ~100px strip on every tab. The layout now lives in role
 * classes; this pins that they stack under 768px. (The real proof is the responsive walk, which
 * captures Settings at 390px in CI; this is the cheap tripwire for the rule being deleted.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '../../styles/finpal-theme.css'), 'utf8');
const phone = css.slice(css.lastIndexOf('/* ── Settings shell'));
const media = phone.slice(phone.indexOf('@media (max-width: 767px)'));

describe('Settings shell (D-313)', () => {
  it('is a row on a wide screen', () => {
    expect(phone).toMatch(/\.fp-settings-shell\s*\{[^}]*display:\s*flex/);
    expect(phone).toMatch(/\.fp-settings-aside\s*\{[^}]*width:\s*240px/);
  });

  it('stacks under 768px, with the pane full-width and the content padding cut', () => {
    expect(media).toMatch(/\.fp-settings-shell\s*\{[^}]*flex-direction:\s*column/);
    expect(media).toMatch(/\.fp-settings-aside\s*\{[^}]*width:\s*100%/);
    expect(media).toMatch(/\.fp-settings-content\s*\{[^}]*padding:\s*20px 16px/);
  });

  it('turns the tabs into one scrolling row rather than a tall column', () => {
    expect(media).toMatch(/\.fp-settings-nav\s*\{[^}]*flex-direction:\s*row/);
    expect(media).toMatch(/\.fp-settings-nav\s*\{[^}]*overflow-x:\s*auto/);
  });
});
