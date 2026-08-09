/**
 * The accounts list obeys the same two rules as the transactions ledger.
 *
 * *** THIS EXISTS BECAUSE A DECISION LEAKED. *** O1 settled that red means
 * "this is a problem" rather than "this is money leaving". The accounts list was
 * still painting a **red delete button on every row** — so a delete button
 * *existing* read as a problem, twenty times over on a twenty-account instance.
 * The colour belongs on the moment of intent, not on the affordance.
 *
 * It was found by RENDERING the page, not by reading it: a grep showed the vary
 * rule honoured and the scoping correct, and concluded nothing was needed. The
 * screenshot showed twenty red buttons.
 *
 * The second rule is reachability — actions revealed on hover must also be
 * reachable by keyboard and always present where there is no hover at all. Both
 * pages now share ONE definition (`.fp-row-acts` revealed by `.fp-revealer`)
 * rather than two that drift.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'fs';
import { join } from 'path';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Accounts } from '../../pages/Accounts';
import { ToastProvider } from '../../contexts/ToastContext';

const BASE = '*';
const THEME = readFileSync(
  join(__dirname, '..', '..', 'styles', 'finpal-theme.css'), 'utf8');

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

function seed(count = 6) {
  const accounts = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Account ${i + 1}`,
    account_type: 'checking',
    balance: 100 + i,
    currency_code: 'GBP',
    institution: 'Bank',
    is_active: true,
    color: '#15803d',
    owner: { id: 'alice@test.com', name: 'Alice' },
  }));
  server.use(
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([
      { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com', role: 'owner', joinedAt: '2026-01-01' },
    ])),
  );
  return accounts;
}

async function renderPage() {
  const view = render(
    <MemoryRouter><ToastProvider><Accounts /></ToastProvider></MemoryRouter>
  );
  await waitFor(() => expect(screen.getAllByLabelText('Delete account').length).toBeGreaterThan(0));
  return view;
}

describe('O1 holds here too: no row is red at rest', () => {
  it('paints NO delete button red by default', async () => {
    const { container } = await renderPage();

    const reds = Array.from(container.querySelectorAll('button'))
      .map((b) => `${(b as HTMLElement).style.color} ${(b as HTMLElement).style.background} ${(b as HTMLElement).style.border}`)
      .filter((s) => /accent-red|239,\s*68,\s*68/.test(s));

    expect(reds).toEqual([]);
  });

  it('still offers a delete on every row, with its label intact', async () => {
    // Quieting a control must not remove it, and must not remove how a screen
    // reader finds it. U-04 territory.
    seed(6);
    await renderPage();
    expect(screen.getAllByLabelText('Delete account')).toHaveLength(6);
    expect(screen.getAllByLabelText('Edit account')).toHaveLength(6);
  });

  it('keeps red for the balance, which is a figure whose SIGN means something', async () => {
    // The point of O1 rather than an exception to it — the same rule that keeps
    // Monarch's "Remaining" column red. A negative balance stays red.
    const source = readFileSync(
      join(__dirname, '..', '..', 'pages', 'Accounts.tsx'), 'utf8');
    expect(source).toMatch(/balance < 0 \? 'var\(--accent-red\)'/);
  });
});

describe('one definition of "row actions", shared by both pages', () => {
  it('reveals on hover AND focus-within, keyed to a generic ancestor', () => {
    // Keyed to `.fp-revealer` rather than to a row class, so a third list can
    // adopt it without editing the rule — which is what would eventually produce
    // the second copy that drifts.
    expect(THEME).toMatch(/\.fp-revealer:hover \.fp-row-acts/);
    expect(THEME).toMatch(/\.fp-revealer:focus-within \.fp-row-acts/);
  });

  it('stays visible where there is no hover at all', () => {
    const coarse = THEME.match(/@media \(hover: none\) \{[^@]*?\.fp-row-acts \{[^}]*\}/s)?.[0] ?? '';
    expect(coarse).toMatch(/opacity:\s*1/);
  });

  it('turns destructive red only on hover and focus', () => {
    const rule = THEME.match(/\.fp-row-acts button\[data-destructive\][^{]*\{[^}]*\}/s)?.[0] ?? '';
    expect(rule).toMatch(/--accent-red/);
    expect(rule).toMatch(/:hover/);
    expect(rule).toMatch(/:focus-visible/);
  });

  it('the accounts row opts into the shared reveal', async () => {
    const { container } = await renderPage();
    expect(container.querySelectorAll('.fp-revealer').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.fp-row-acts').length).toBeGreaterThan(0);
  });
});
