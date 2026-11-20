import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { SkillsCard, useSkillsProgress } from './SkillsCard';

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
  });
});

const skills = ['Interest', 'Buffer', 'Fixed costs', 'Sinking funds', 'Your month', 'Debt order'].map((title, i) => ({
  id: `s${i}`, title, marks: { understood: i % 2 === 0, used: false, remembered: false },
}));

const Host: React.FC = () => {
  const { skills: s, loading } = useSkillsProgress();
  return <div data-testid="host" data-loading={String(loading)}>{s && <SkillsCard skills={s} />}</div>;
};
const serve = (body: unknown, status = 200) =>
  server.use(http.get('*/api/v1/learnpal/skills-progress', () => HttpResponse.json(body as never, { status })));

describe('SkillsCard', () => {
  it('lists six rows with dots under "Your skills"', async () => {
    serve({ enabled: true, skills });
    render(<Host />);
    expect(await screen.findByText('Your skills')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getAllByTestId('skill-dots')).toHaveLength(6);
    // Each row's dots name the skill and all three marks; each dot names its own mark (UX audit 2026-11-20).
    expect(screen.getByRole('img', { name: 'Interest: understood, not yet used on your money, not yet remembered' }))
      .toBeInTheDocument();
    const dots = screen.getAllByTestId('skill-dots')[1].children;
    expect([...dots].map((d) => d.getAttribute('title')))
      .toEqual(['Understood: not yet', 'Used on your money: not yet', 'Remembered: not yet']);
    // The three marks are named in words once, so the dots are not a code to crack.
    expect(screen.getByText('Understood · Used on your money · Remembered')).toBeInTheDocument();
  });

  it('is hidden when learning is off or the fetch fails', async () => {
    for (const [body, status] of [[{ enabled: false, skills: [] }, 200], [{}, 500]] as const) {
      serve(body, status);
      const { unmount } = render(<Host />);
      await new Promise((r) => setTimeout(r, 50));
      await waitFor(() => expect(screen.queryByTestId('skills-card')).toBeNull());
      unmount();
    }
  });

  it('reports loading until the fetch settles, then not loading with or without skills', async () => {
    serve({ enabled: true, skills });
    const { unmount } = render(<Host />);
    expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'true');
    await waitFor(() => expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'false'));
    unmount();
    serve({ enabled: false, skills: [] });
    render(<Host />);
    await waitFor(() => expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'false'));
    expect(screen.queryByTestId('skills-card')).toBeNull();
  });
});
