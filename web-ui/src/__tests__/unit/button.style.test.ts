/**
 * Button must MERGE a caller's style, not be replaced by it.
 *
 * Written as `style={style}` before `{...props}`, a caller passing `style` — even
 * just to change a colour — silently discarded Button's padding, border-radius
 * and inline-flex layout. TypeScript cannot see the difference, the build passes,
 * and the button simply renders wrong. A subagent hit this converting
 * TeamManagement and had to duplicate Button's internals to work around it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// process.cwd() is web-ui when vitest runs; import.meta.url is not a file URL
// under this config.
const source = readFileSync(
  resolve(process.cwd(), 'src/components/common/Button.tsx'), 'utf8');

describe('Button style handling', () => {
  it('merges the caller style rather than letting it replace everything', () => {
    expect(source).toMatch(/\{\s*\.\.\.style,\s*\.\.\.props\.style\s*\}/);
  });

  it('applies style after the props spread, so the merge is not undone', () => {
    const spreadAt = source.indexOf('{...props}');
    const styleAt = source.indexOf('style={mergedStyle}');
    expect(spreadAt).toBeGreaterThan(-1);
    expect(styleAt).toBeGreaterThan(spreadAt);
  });

  it('never passes the raw computed style directly', () => {
    // `style={style}` is the shape that caused the bug. Comment lines are
    // stripped first — the fix documents the old shape by name, and matching
    // that would fail forever for the wrong reason.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/style=\{style\}/);
  });
});
