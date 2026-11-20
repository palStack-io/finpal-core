import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../../__tests__/mocks/server';
import { api } from '../../../services/api';
import { useAuthStore } from '../../../store/authStore';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import Lessons from './Lessons';

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
  });
  const row = (slug: string, earned: boolean) => ({
    slug, title: `Title ${slug}`, gear_slug: null, surface: 'x', applies_to_direction: null,
    unlock_at_progress: null, earned, has_body: true,
  });
  server.use(
    http.get('*/api/v1/learnpal/lessons', () => HttpResponse.json({
      success: true, lessons: [row('what-your-apr-costs', true), row('locked-one', false)], read: 1, total: 2 })),
    http.get('*/api/v1/learnpal/lessons/:slug', ({ params }) => HttpResponse.json({
      success: true, lesson: { slug: params.slug, title: `Title ${params.slug}`, gear_slug: null, surface: 'x',
        earned: true, body_md: 'Body text here', locked: false, quiz: null } })),
  );
});

const draw = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><ThemeProvider><Lessons /></ThemeProvider></MemoryRouter>);

describe('Lessons ?lesson= deep link', () => {
  it('opens the named earned lesson on load', async () => {
    draw('/learnpal/lessons?lesson=what-your-apr-costs');
    expect(await screen.findByText('Body text here')).toBeTruthy();
  });
  it('does not open a locked lesson', async () => {
    draw('/learnpal/lessons?lesson=locked-one');
    await screen.findByTestId('lesson-locked-one');
    expect(screen.queryByText('Body text here')).toBeNull();
  });
  it('opens nothing without the param', async () => {
    draw('/learnpal/lessons');
    await screen.findByTestId('lesson-locked-one');
    expect(screen.queryByText('Body text here')).toBeNull();
  });
});
