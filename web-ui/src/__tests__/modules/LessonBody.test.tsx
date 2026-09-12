/**
 * The lesson reader's markdown — and the negative that matters.
 *
 * *** THE ASSERTION THAT WOULD HAVE CAUGHT THE OLD RENDERER IS "NO LITERAL
 * `###`". *** The panel used to put `body_md` in a `white-space: pre-wrap` div,
 * which is green on every positive test you can write — the heading text IS on
 * screen, the bold text IS on screen — and shows the user `### Where it
 * actually goes`. So every construct here is checked twice: that it renders as
 * the right element, and that its syntax is nowhere in the rendered text.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LessonBody, { parseBlocks, renderInline } from '../../modules/learnpal/LessonBody';

const SAMPLE = [
  '### The rope you tie on first',
  '',
  'There is a common piece of advice that you want three to six months of expenses',
  'saved before anything else.',
  '',
  'Here is the part that gets left out: **most of the protection comes from the',
  'first small bit.** And what it *does for you* is the point.',
  '',
  '> **Where the 3-6 months figure comes from:** it is a widely repeated rule of',
  '> thumb, not a rule finPal applies.',
].join('\n');

describe('parseBlocks', () => {
  it('classifies the heading, the paragraphs and the aside', () => {
    const blocks = parseBlocks(SAMPLE);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'para', 'para', 'aside']);
    expect(blocks[0].text).toBe('The rope you tie on first');
  });

  it('joins a hard-wrapped paragraph into one line', () => {
    // The drafts wrap at ~95 columns for an editor. Honouring those breaks is
    // what made the old pre-wrap div wrap every line twice on a phone.
    const [, para] = parseBlocks(SAMPLE);
    expect(para.text).toBe(
      'There is a common piece of advice that you want three to six months of '
      + 'expenses saved before anything else.');
    expect(para.text).not.toContain('\n');
  });

  it('strips the marker from every line of a multi-line aside', () => {
    const aside = parseBlocks(SAMPLE)[3];
    expect(aside.text).not.toContain('>');
    expect(aside.text).toContain('not a rule finPal applies');
  });
});

describe('renderInline', () => {
  it('does not read **bold** as an empty italic around *bold*', () => {
    const { container } = render(<p>{renderInline('a **b** c')}</p>);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.querySelectorAll('em')).toHaveLength(0);
    expect(container.textContent).toBe('a b c');
  });

  it('renders a single-asterisk span as an em', () => {
    const { container } = render(<p>{renderInline('what it *does for you*')}</p>);
    expect(container.querySelector('em')?.textContent).toBe('does for you');
  });

  it('leaves a lone asterisk alone rather than swallowing the rest', () => {
    const { container } = render(<p>{renderInline('2 * 3 = 6')}</p>);
    expect(container.textContent).toBe('2 * 3 = 6');
  });
});

describe('LessonBody', () => {
  it('renders the sub-headline as a heading element', () => {
    render(<LessonBody markdown={SAMPLE} />);
    const h = screen.getByRole('heading', { name: 'The rope you tie on first' });
    expect(h.tagName).toBe('H3');
  });

  it('renders emphasis as strong and em, not as text', () => {
    const { container } = render(<LessonBody markdown={SAMPLE} />);
    expect(container.querySelector('strong')?.textContent)
      .toContain('most of the protection');
    expect(container.querySelector('em')?.textContent).toBe('does for you');
  });

  it('*** SHOWS NO MARKDOWN SYNTAX AT ALL ***', () => {
    // The pre-wrap renderer passed every assertion above this one.
    const { container } = render(<LessonBody markdown={SAMPLE} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('###');
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/(^|\s)>\s/);
  });

  it('sets the aside apart from the prose rather than running it on', () => {
    const { container } = render(<LessonBody markdown={SAMPLE} />);
    // The outer wrapper contains the aside's text too, so the aside is the
    // node that has it and does NOT have the paragraph before it.
    const aside = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent?.includes('widely repeated rule of thumb')
        && !d.textContent.includes('most of the protection'));
    expect(aside).toBeTruthy();
    // `style.borderLeft` reads back empty in jsdom for a shorthand holding a
    // `var()`; the attribute is what React actually rendered.
    expect(aside?.getAttribute('style')).toContain('border-left');
    expect(aside?.getAttribute('style')).toContain('var(--border-medium)');
  });

  it('says so plainly when a lesson has no body', () => {
    render(<LessonBody markdown={null} />);
    expect(screen.getByText('Nothing written for this one yet.')).toBeTruthy();
  });
});
