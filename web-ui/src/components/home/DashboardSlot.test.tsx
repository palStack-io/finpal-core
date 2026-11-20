import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardSlot, type SlotEntry } from './DashboardSlot';

const entry = (key: string, state: SlotEntry['state']): SlotEntry => ({
  key, state, render: () => <p>{key} card</p>,
});

describe('DashboardSlot', () => {
  it('shows only the first card that has something, when two do', () => {
    render(<DashboardSlot entries={[entry('hard-month', 'show'), entry('this-week', 'show')]} />);
    expect(screen.getByText('hard-month card')).toBeInTheDocument();
    expect(screen.queryByText('this-week card')).toBeNull();
  });

  it('waits while an earlier entry is still loading', () => {
    render(<DashboardSlot entries={[entry('hard-month', 'loading'), entry('this-week', 'show')]} />);
    expect(screen.queryByText('this-week card')).toBeNull();
  });

  it('skips settled entries that have nothing and shows the next one', () => {
    render(<DashboardSlot entries={[entry('hard-month', 'hide'), entry('this-week', 'show')]} />);
    expect(screen.getByText('this-week card')).toBeInTheDocument();
  });

  it('does not wait on entries after the first that shows', () => {
    render(<DashboardSlot entries={[entry('recall', 'show'), entry('this-week', 'loading')]} />);
    expect(screen.getByText('recall card')).toBeInTheDocument();
  });

  it('renders nothing when every entry hides', () => {
    const { container } = render(<DashboardSlot entries={[entry('a', 'hide'), entry('b', 'hide')]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
