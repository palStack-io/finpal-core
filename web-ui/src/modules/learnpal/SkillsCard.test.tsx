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
  const s = useSkillsProgress();
  return <div data-testid="host">{s && <SkillsCard skills={s} />}</div>;
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
});
