import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideTour } from '../../components/guide/GuideTour';
import { useGuideStore } from '../../store/guideStore';

const service = vi.hoisted(() => ({ getGuides: vi.fn(), dismissGuide: vi.fn(), completeTour: vi.fn() }));
vi.mock('../../services/onboardingService', () => ({ onboardingService: service }));

const STEPS = [
  { target: 'goal-new', title: 'Start a goal', body: 'Body one.' },
  { target: 'gone', title: 'Not on the page', body: 'Never shown.' },
  { target: 'goal-list', title: 'Your goals', body: 'Body two.' },
];

const Page = ({ extra = true }: { extra?: boolean }) => (
  <div>
    <button data-guide="goal-new">New goal</button>
    {extra && <ul data-guide="goal-list"><li>x</li></ul>}
    <GuideTour page="goals" steps={STEPS} />
  </div>
);

beforeEach(() => {
  useGuideStore.getState().reset();
  useGuideStore.setState({ status: 'ready', touring: 'goals' });
  Object.values(service).forEach((f) => f.mockReset());
  service.completeTour.mockResolvedValue({ dismissed: [], toured: ['goals'] });
  Element.prototype.scrollIntoView = vi.fn();
});

describe('GuideTour', () => {
  it('shows a labelled dialog on the first step with a step counter', () => {
    render(<Page />);
    expect(screen.getByRole('dialog', { name: /page tour/i })).toBeInTheDocument();
    expect(screen.getByText('Start a goal')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();     // the missing target is not counted
  });

  it('SKIPS a step whose target is not on the page', async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.queryByText('Not on the page')).toBeNull();
    expect(screen.getByText('Your goals')).toBeInTheDocument();
  });

  it('outlines the current target and removes the outline when it moves on', async () => {
    render(<Page />);
    expect(screen.getByText('New goal')).toHaveClass('fp-guide-target');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('New goal')).not.toHaveClass('fp-guide-target');
  });

  it('Done on the last step records the tour', async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(service.completeTour).toHaveBeenCalledWith('goals');
    expect(useGuideStore.getState().touring).toBeNull();
  });

  it('Escape skips, and records, so the tour is not offered as new forever', async () => {
    render(<Page />);
    await userEvent.keyboard('{Escape}');
    expect(service.completeTour).toHaveBeenCalledWith('goals');
  });

  it('a tour with NO targets on the page closes itself and shows nothing', () => {
    render(<div><GuideTour page="goals" steps={STEPS} /></div>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGuideStore.getState().touring).toBeNull();
    expect(service.completeTour).not.toHaveBeenCalled();     // nothing was shown, so nothing is recorded
  });

  it('returns focus to what had it before the tour opened', async () => {
    const Host = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>opener</button>
          <button data-guide="goal-new">New goal</button>
          {open && <GuideTour page="goals" steps={[STEPS[0]]} />}
        </div>
      );
    };
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('moves focus in ONCE: advancing a step must not jump back to "Skip tour" (review finding 4)', async () => {
    render(<Page />);
    const next = screen.getByRole('button', { name: /next/i });
    next.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('Your goals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip tour/i })).not.toHaveFocus();
  });

  it('scrolls instantly, then places the popover where the target now IS, and again on resize (finding 5)', async () => {
    const rect = (top: number) => ({ top, bottom: top + 40, left: 20, right: 120, width: 100, height: 40, x: 20, y: top, toJSON: () => ({}) });
    let top = 50;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.getAttribute('data-guide') ? rect(top) : rect(0)) as DOMRect;
    });
    render(<Page />);
    const dialog = () => screen.getByRole('dialog') as HTMLElement;
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(dialog().style.top).toBe('102px');                   // 50 + 40 + 12
    top = 300;
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => expect(dialog().style.top).toBe('352px'));
    spy.mockRestore();
  });

  it('sits INSIDE a tall target instead of covering what is below it (the Dashboard range)', () => {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 20, right: 920, width: 900, height, x: 20, y: top, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.getAttribute('data-guide') ? rect(50, 400) : rect(0, 0)) as DOMRect;
    });
    render(<Page />);
    const dialog = screen.getByRole('dialog') as HTMLElement;
    // 400px tall is more than a third of the 768px viewport: anchored to the target's bottom-right
    // corner, inside it. Below it (top 462px) the popover would sit on the cards underneath.
    expect(parseInt(dialog.style.top, 10)).toBeLessThan(450);
    expect(parseInt(dialog.style.left, 10)).toBeGreaterThan(400);
    spy.mockRestore();
  });
});
