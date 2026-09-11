import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SlidePanel } from '../../components/SlidePanel';

/**
 * `SlidePanel` is used by Accounts, Transactions, Budgets, Groups, GroupDetail
 * and now Goals, and had NO test file of its own. That is the shape that let
 * four issues ship out of `api/v1/team.py`: a file everything depends on and
 * nothing names.
 *
 * A real animation frame is needed because the focus move is inside
 * `requestAnimationFrame`, so each test flushes one.
 */
const flushFrame = async () => {
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
};

describe('SlidePanel — focus on open', () => {
  it('*** DOES NOT FOCUS THE CLOSE BUTTON, WHICH IS THE FIRST FOCUSABLE ***', async () => {
    render(
      <SlidePanel isOpen onClose={vi.fn()} title="New goal">
        <label htmlFor="f1">Name</label>
        <input id="f1" />
      </SlidePanel>,
    );
    await flushFrame();
    // The header's dismiss control is first in the DOM. Handing it focus gives
    // somebody who just opened a form a control that a SPACE activates.
    expect(document.activeElement?.getAttribute('aria-label')).not.toBe('Close panel');
    expect((document.activeElement as HTMLElement)?.id).toBe('f1');
  });

  it('falls back to the panel itself when it holds no fields', async () => {
    render(
      <SlidePanel isOpen onClose={vi.fn()} title="Empty">
        <p>Nothing to fill in.</p>
      </SlidePanel>,
    );
    await flushFrame();
    // Not left on whatever was behind the backdrop.
    expect(document.activeElement?.getAttribute('role')).toBe('dialog');
  });
});

describe('SlidePanel — typing must not dismiss it', () => {
  /**
   * *** THE BUG THIS GUARDS WAS USER-FACING AND ALMOST INVISIBLE. ***
   * Focus was moved to the first focusable — the close button — inside a
   * `requestAnimationFrame`. On a slow render that landed MID-TYPING, so the
   * next SPACE in an ordinary goal name ("Pay off my cards") activated the
   * button and threw the form away. It reproduced as a test that passed alone
   * and failed in its file, because the frame fired before typing in one run
   * and during it in the other.
   *
   * A parent that keeps its form state in the PAGE re-renders on every
   * keystroke, which is what made Goals hit it while five other callers did
   * not — an accident of where each keeps state, not a property to rely on.
   */
  it('survives a space typed into a field while the parent re-renders', async () => {
    const onClose = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState('');
      return (
        // A NEW `onClose` identity on every render, exactly as every caller writes it.
        <SlidePanel isOpen onClose={() => onClose()} title="New goal">
          <label htmlFor="name">Name</label>
          <input id="name" value={value} onChange={(e) => setValue(e.target.value)} />
        </SlidePanel>
      );
    };
    render(<Harness />);
    await flushFrame();
    await userEvent.type(screen.getByLabelText('Name'), 'Pay off my cards');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value)
      .toBe('Pay off my cards');
  });

  it('still closes on Escape, and with a churning onClose identity', async () => {
    const onClose = vi.fn();
    const Harness = () => {
      const [v, setV] = useState('');
      return (
        <SlidePanel isOpen onClose={() => onClose()} title="T">
          <label htmlFor="n">Name</label>
          <input id="n" value={v} onChange={(e) => setV(e.target.value)} />
        </SlidePanel>
      );
    };
    render(<Harness />);
    await flushFrame();
    // Type first, so the listener has survived several re-renders. `onClose` is
    // read through a ref, so its identity changing must not detach the handler.
    await userEvent.type(screen.getByLabelText('Name'), 'abc');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });


  /**
   * *** THIS TEST EXISTS BECAUSE A SABOTAGE PASSED. ***
   * Putting `onClose` back in the listener effect's dependencies broke nothing
   * the other four tests could see: the refocus lands on the first FIELD, and in
   * a one-field panel that is the field you are already in.
   *
   * With TWO fields it is plainly a bug. Every caller writes
   * `onClose={() => setOpen(false)}`, a new identity per render, and a parent
   * holding form state re-renders on each keystroke — so typing in the second
   * field would yank the cursor back to the first, one character in. Reading
   * `onClose` through a ref is what stops it, and this is the assertion that
   * makes that real rather than defensive.
   */
  it('does NOT yank focus back to the first field while typing in a later one', async () => {
    const Harness = () => {
      const [a, setA] = useState('');
      const [b, setB] = useState('');
      return (
        <SlidePanel isOpen onClose={() => {}} title="Two fields">
          <label htmlFor="one">One</label>
          <input id="one" value={a} onChange={(e) => setA(e.target.value)} />
          <label htmlFor="two">Two</label>
          <input id="two" value={b} onChange={(e) => setB(e.target.value)} />
        </SlidePanel>
      );
    };
    render(<Harness />);
    await flushFrame();
    await userEvent.type(screen.getByLabelText('Two'), 'hello');
    // *** FLUSHING A FRAME HERE IS THE WHOLE POINT. *** The focus move lives in
    // a `requestAnimationFrame`, and rapid typing cancels each pending frame
    // before it fires — so an assertion made immediately after typing passes
    // even when the bug is present. That timing is exactly what made the
    // original defect a Heisenbug. Letting one frame land makes it decidable.
    await flushFrame();
    expect((document.activeElement as HTMLElement)?.id).toBe('two');
    expect((screen.getByLabelText('Two') as HTMLInputElement).value).toBe('hello');
    expect((screen.getByLabelText('One') as HTMLInputElement).value).toBe('');
  });

  it('the close button still closes it', async () => {
    const onClose = vi.fn();
    render(<SlidePanel isOpen onClose={onClose} title="T"><input /></SlidePanel>);
    await flushFrame();
    await userEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
