import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageGuide } from '../../components/guide/PageGuide';
import { GuideButton } from '../../components/guide/GuideButton';
import { useGuideStore } from '../../store/guideStore';

const service = vi.hoisted(() => ({ getGuides: vi.fn(), dismissGuide: vi.fn(), completeTour: vi.fn() }));
vi.mock('../../services/onboardingService', () => ({ onboardingService: service }));

const GOALS = {
  heading: 'Goals: every goal is a mountain', lines: ['One.', 'Two.'], pose: 'summit',
  tour: [{ target: 'goal-new', title: 'Start a goal', body: 'Body.' }],
};
const ACCOUNTS = { heading: 'Accounts: where', lines: ['One.', 'Two.'], pose: 'map' };

const ready = (dismissed: string[] = []) => useGuideStore.setState({
  status: 'ready', lang: 'en', pages: { goals: GOALS, accounts: ACCOUNTS }, dismissed: dismissed as never, toured: [],
});

beforeEach(() => { useGuideStore.getState().reset(); Object.values(service).forEach((f) => f.mockReset()); });

describe('PageGuide', () => {
  it('renders nothing until the state has loaded, and nothing if it failed', () => {
    service.getGuides.mockReturnValue(new Promise(() => {}));
    const { container, rerender } = render(<PageGuide page="goals" />);
    expect(container).toBeEmptyDOMElement();
    useGuideStore.setState({ status: 'failed' });
    rerender(<PageGuide page="goals" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the state is still loading, even if copy is already present', () => {
    // A stale payload must not flash a card at someone who has already dismissed it.
    useGuideStore.setState({ status: 'loading', pages: { goals: GOALS }, dismissed: [] });
    const { container } = render(<PageGuide page="goals" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the card on first open and writes the dismissal on "Got it"', async () => {
    ready();
    service.dismissGuide.mockResolvedValue({ dismissed: ['goals'], toured: [] });
    render(<PageGuide page="goals" />);
    expect(screen.getByRole('region', { name: /goals: every goal is a mountain/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(service.dismissGuide).toHaveBeenCalledWith('goals');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows nothing for a page that was already dismissed', () => {
    ready(['goals']);
    render(<PageGuide page="goals" />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('offers a tour only on a page that has one', () => {
    ready();
    const { unmount } = render(<PageGuide page="goals" />);
    expect(screen.getByRole('button', { name: /show me around/i })).toBeInTheDocument();
    unmount();
    render(<PageGuide page="accounts" />);
    expect(screen.queryByRole('button', { name: /show me around/i })).toBeNull();
  });

  it('is decorative: the picture is hidden from assistive technology', () => {
    ready();
    const { container } = render(<PageGuide page="goals" />);
    const art = container.querySelector('[data-guide-art="goals"]') as HTMLElement;
    expect(art).not.toBeNull();
    expect(art.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('a tour does not outlive its page (review finding 8)', () => {
  it('leaving the page mid-tour ends the tour, so it cannot restart unprompted on return', () => {
    ready();
    useGuideStore.setState({ touring: 'goals' });
    // A real target on the page keeps the tour alive; with none it would close itself.
    const { unmount } = render(<><button data-guide="goal-new">New goal</button><PageGuide page="goals" /></>);
    expect(screen.getByRole('dialog', { name: /page tour/i })).toBeInTheDocument();
    unmount();
    expect(useGuideStore.getState().touring).toBeNull();
  });
});

describe('GuideButton', () => {
  it('is absent until the card has been dismissed (the card is the entry point first)', () => {
    ready();
    render(<GuideButton page="goals" />);
    expect(screen.queryByRole('button', { name: /about this page/i })).toBeNull();
  });

  it('reopens the card after dismissal WITHOUT writing anything', async () => {
    ready(['goals']);
    render(<><GuideButton page="goals" /><PageGuide page="goals" /></>);
    await userEvent.click(screen.getByRole('button', { name: /about this page/i }));
    expect(screen.getByRole('region', { name: /goals: every goal is a mountain/i })).toBeInTheDocument();
    expect(service.dismissGuide).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(service.dismissGuide).not.toHaveBeenCalled();     // closing a reopened card is not a second dismissal
    expect(screen.queryByRole('region')).toBeNull();
  });
});
