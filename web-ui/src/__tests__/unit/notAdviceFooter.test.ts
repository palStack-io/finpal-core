/** Redesign A2 (Harun 2026-11-25): core carries the same not-advice line as the hosted service, in the sidebar footer. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('not-advice line', () => {
  it('the sidebar footer says finPal is not financial, tax or legal advice', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8');
    expect(src).toContain('finPal explains money; it is not financial, tax or legal advice. For a big decision, talk to a fiduciary.');
  });
});
