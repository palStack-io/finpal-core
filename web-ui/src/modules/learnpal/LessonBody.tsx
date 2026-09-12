/**
 * The lesson reader's markdown.
 *
 * *** THIS BUILDS REACT ELEMENTS AND NEVER TOUCHES `innerHTML`. *** That is the
 * whole reason it exists rather than a markdown dependency: the previous
 * session deferred rendering because "adding a markdown renderer is its own
 * decision with its own sanitisation question", and it is right that it is —
 * for a renderer that produces HTML. A parser whose only outputs are `<h3>`,
 * `<p>`, `<strong>`, `<em>` and a styled `<div>` cannot inject anything,
 * because there is no path from the text to markup at all.
 *
 * *** AND UNTIL IT EXISTED THE BODIES WERE UNREADABLE. *** The panel rendered
 * `body_md` into a `white-space: pre-wrap` div, so every `###` and every `**`
 * in nineteen approved lessons showed up on screen as literal syntax. Filling
 * the column and leaving that div in place would have shipped the defect, which
 * is why this is in the same change and not a follow-up.
 *
 * It handles exactly four constructs, matching what the approved drafts use:
 *   `### heading`   a sub-headline (the panel title is the lesson title)
 *   `**bold**`      emphasis
 *   `*italic*`      emphasis
 *   `> aside`       the drafts' own "where this figure comes from" note
 * A fifth renders as raw syntax, so `test_no_body_carries_an_unrenderable_
 * construct` in the backend suite fails the moment a draft grows a table or a
 * link — at the point the prose lands, not in a screenshot afterwards.
 *
 * Soft line breaks are JOINED. The drafts are hard-wrapped at about 95
 * columns for reading in an editor, and honouring those breaks is what the
 * pre-wrap div was doing wrong at 390px: every line wrapped twice.
 */

import React from 'react';

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'aside'; text: string };

/** Split on blank lines, then classify. Exported for its own test. */
export const parseBlocks = (md: string): Block[] => {
  const blocks: Block[] = [];
  for (const raw of md.split(/\n\s*\n/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    if (chunk.startsWith('### ')) {
      blocks.push({ kind: 'heading', text: chunk.slice(4).trim() });
    } else if (chunk.startsWith('>')) {
      // Every line of an aside carries the marker; strip it from each.
      blocks.push({
        kind: 'aside',
        text: chunk.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ').trim(),
      });
    } else {
      blocks.push({ kind: 'para', text: chunk.split('\n').join(' ') });
    }
  }
  return blocks;
};

/**
 * `**bold**` and `*italic*` within one line.
 *
 * Bold is matched FIRST and the alternation is ordered, so `**x**` cannot be
 * read as an empty italic wrapping `*x*` — which is the classic way a
 * hand-rolled inline parser mangles its most common input.
 */
export const renderInline = (text: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={key++}>{m[1]}</strong>);
    } else {
      out.push(<em key={key++}>{m[2]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

/**
 * *** SIZED IN `rem`, NOT `px`, AND CAPPED BY THE PANEL. *** The panel is the
 * one place in the app a user reads several hundred words, so the body is a
 * step up from the 14px UI text rather than the same size. No width media
 * query: the slide panel already constrains its own width, and a fixed
 * `maxWidth` here would leave a gutter on a phone.
 */
const LessonBody: React.FC<{ markdown: string | null }> = ({ markdown }) => {
  if (!markdown) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        Nothing written for this one yet.
      </div>
    );
  }

  return (
    <div style={{ color: 'var(--text-primary)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
      {parseBlocks(markdown).map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <h3
              key={i}
              style={{
                fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35,
                margin: i === 0 ? '0 0 0.75rem' : '1.5rem 0 0.75rem',
                color: 'var(--text-primary)',
              }}
            >
              {renderInline(b.text)}
            </h3>
          );
        }
        if (b.kind === 'aside') {
          return (
            <div
              key={i}
              style={{
                margin: '1.25rem 0 0',
                padding: '0.75rem 1rem',
                borderLeft: '3px solid var(--border-medium)',
                background: 'var(--bg-secondary)',
                borderRadius: '0 6px 6px 0',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
              }}
            >
              {renderInline(b.text)}
            </div>
          );
        }
        return (
          <p key={i} style={{ margin: i === 0 ? '0' : '0.875rem 0 0' }}>
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
};

export default LessonBody;
