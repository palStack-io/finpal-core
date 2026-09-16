/**
 * Everything finPal guessed, in one place, so it can be confirmed or corrected.
 *
 * *** THE POINT IS THAT THE LIST CAN BE FINISHED. *** Every row here has a
 * button that removes it, the counts come from the server after every action,
 * and when there is nothing left the page says so rather than rendering three
 * empty headings. A chore list that never empties is worse than no chore list.
 *
 * *** NO DENOMINATOR, ANYWHERE. *** "3 to review", never "3 of 47" and never a
 * progress bar. The first is momentum; the second is a report card about your
 * own mistakes, and not making people feel worse about their money is a stated
 * purpose of this app (voice rule 11). The server does not send a page size for
 * the same reason, so there is nothing here to accidentally divide by.
 *
 * *** THE THIRD SECTION IS A DIFFERENT QUESTION AND LOOKS DIFFERENT. *** The
 * first two say "finPal decided X — was it right?" and offer Confirm. The third
 * says finPal has no opinion, so it offers a picker and no Confirm button: there
 * is nothing to agree with, and a Confirm there would be a control that cannot
 * mean anything.
 *
 * *** A 403 ON AN ACCOUNT IS EXPECTED, NOT AN ERROR. *** The page shows every
 * household account on purpose — narrowing the read would put a row in the list
 * that its viewer cannot open (D-43) — but only the owner or an admin may write
 * one. So the refusal is rendered on the row, in the server's own words, rather
 * than as a failed request.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { coinService } from '../services/coinService';
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import { categoriesApi } from '../services/api/categories';
import { transactionsApi } from '../services/api/transactions';
import { accountService } from '../services/accountService';
import { reviewApi, type ReviewPayload } from '../services/api/review';
import { useReviewStore } from '../store/reviewStore';
import { GROUP_LABELS, GROUP_ORDER, UNSORTED_LABEL } from '../utils/spendingGroups';
import { formatMoney } from '../styles/money';
import { pageContainerStyle } from '../styles/layoutStyles';
import { PageHead } from '../components/PageHead';

/**
 * The account types the API actually accepts.
 *
 * *** MEASURED AGAINST THE SERVER, NOT COPIED FROM THE EDIT FORM. *** This list
 * first read `[... 'cash', 'investment', 'loan']`, lifted from what
 * `EditAccountForm` offers — and `loan` is **not** a value the API takes.
 * Proven on the deployed demo rather than inferred:
 *
 *     POST /api/v1/accounts  {"account_type": "loan"}  -> 400
 *       "Must be one of: checking, savings, credit, investment, cash, other."
 *     POST /api/v1/accounts  {"account_type": "cash"}  -> 201
 *
 * So both account forms have always offered an option the server refuses — a
 * pre-existing defect this page uncovered rather than caused, recorded as
 * **D-203** and left for the owner, because "add `loan` to the server" and
 * "drop it from the forms" are materially different products and three separate
 * client files implement loan-specific behaviour.
 *
 * This page offers only what is known to work. When D-203 is settled, the fix is
 * ONE list both the forms and this page read — an offered option that 400s is
 * D-46's shape, a control that exists and does nothing.
 */
const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'cash', 'other'] as const;

/*
 * *** `var(--brand-main-green)`, NOT THE RAW `#22c55e` ACCENT — AND THE WALK IS
 * WHAT TAUGHT ME THE DIFFERENCE. *** This button shipped as `#22c55e` with white
 * text, which the contrast walk measured at **2.28:1** against the 4.5 it needs,
 * and again at 2.28 against the 3:1 its icon needs. `#22c55e` is the semantic
 * accent this project uses for ICONS, chart fills and trend arrows, where the
 * threshold is 3:1 or nothing at all; it has never been a surface for text.
 * `--brand-main-green` is `#15803d` and measures **5.02:1** with white on it,
 * which is why every other primary button in the app is built from it.
 *
 * `color: 'white'` stays literal on purpose — owner decision, and NOT to be
 * replaced with `var(--text-primary)`, which would invert on the dark theme and
 * put dark text on a green fill.
 */
const confirmButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: 'var(--brand-main-green)', color: 'white', cursor: 'pointer',
  fontSize: 14, fontWeight: 600,
};

/*
 * *** AN UNSTYLED `<Link>` IS NOT NEUTRAL — IT IS `#0000ee`. *** The three links
 * in the footer line carried no colour, so they rendered in the browser's default
 * link blue, which the walk measured at **1.94:1** on the dark card. The token
 * pair below is the one the body text already uses on that surface, so it is
 * measured everywhere else in the app, and the underline is what carries the
 * "this is a link" affordance once the colour no longer does.
 */
const inlineLinkStyle: React.CSSProperties = {
  color: 'var(--text-primary)', textDecoration: 'underline',
};

/**
 * A transaction's date, as a person writes one.
 *
 * *** `Expense.date` IS A DateTime AND THE API SENDS THE WHOLE TIMESTAMP. ***
 * Captured from the live demo, not assumed:
 *
 *     "date": "2026-09-01T07:46:39.847799"
 *
 * This page rendered that string RAW for its first deploy — seven digits of
 * microsecond precision on a row asking "what did you spend this on?". The
 * seconds are an artefact of when the seeder or the importer happened to write
 * the row; they are not information about the purchase, and every other screen
 * in the app formats this column.
 *
 * Returns the ISO string unchanged if it will not parse, rather than rendering
 * `Invalid Date` over a real value.
 */
export function formatRowDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--border-medium)',
  background: 'var(--input-bg)', color: 'var(--text-primary)',
  fontSize: 14,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 16, flexWrap: 'wrap',
  padding: '14px 16px',
  borderTop: '1px solid var(--border-light)',
};

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-light)',
  borderRadius: 12,
  boxShadow: 'var(--card-shadow)',
  marginBottom: 20,
  overflow: 'hidden',
};

/**
 * Reads "3 to review". Never a fraction — see the file docstring.
 *
 * *** THE COINS ARE PER SECTION, BECAUSE CLEARING A SECTION IS WHAT COMPLETES
 * AN ACT *** (`docs/mockups/coins/pages-web-1.html`). Each section here maps to
 * exactly one act — spending groups to `categories_classified`, account types
 * to `accounts_confirmed`, uncategorised transactions to
 * `transactions_categorised` — so the coins belong beside the section rather
 * than in a page total that says nothing about what to do next.
 *
 * *** THE LABEL SAYS "EARNED", AND THAT IS NOT DECORATION. *** `/coins`
 * returns coins ALREADY EARNED for an act, scaled by coverage — not a price for
 * finishing it. Labelling it "+1,500 for clearing this" would be inventing a
 * figure: the act pays progressively and nobody has promised a total. Checked
 * in `api/v1/coins.py` ("What IS sent is the coins earned so far") rather than
 * guessed from the field name.
 */
function SectionHeader({ title, blurb, count, coins }: {
  title: string; blurb: string; count: number; coins?: number | null;
}) {
  return (
    <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0,
                     color: 'var(--text-primary)' }}>{title}</h2>
        <p className="fp-hint" style={{ margin: '4px 0 0' }}>{blurb}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Absent when the act has earned nothing yet: a "0 coins earned" badge
            on the section you have not started is a scolding, and this page is
            the one that has to feel like a way up rather than a list of
            failures. */}
        {coins != null && coins > 0 && (
          <span
            title="Coins earned so far for this, scaled by how much of your own picture it covers"
            style={{
              fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
              background: 'color-mix(in srgb, var(--coin-gold, #8A6A2F) 12%, transparent)',
              color: 'var(--text-primary)',
              border: '1px solid color-mix(in srgb, var(--coin-gold, #8A6A2F) 40%, transparent)',
            }}
          >
            {coins.toLocaleString()} earned
          </span>
        )}
        <span style={{
          fontSize: 13, fontWeight: 600,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--nav-hover)', color: 'var(--text-secondary)',
        }}>
          {count} to review
        </span>
      </div>
    </div>
  );
}

function RowError({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
                  fontSize: 13, color: '#ef4444' }}>
      <AlertCircle size={14} /> <span>{message}</span>
    </div>
  );
}

export default function Review() {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  /**
   * Coins earned per act, keyed by slug.
   *
   * A Map rather than the raw list because each section looks up exactly one
   * act, and an empty Map is the honest default: if `/coins` fails or the
   * deployment predates it, the sections render with no badge rather than a
   * zero, and the review list still works. Coins are the reward for this page,
   * never a precondition for using it.
   */
  const [actCoins, setActCoins] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Keyed `kind:id`, so two rows acting at once cannot overwrite each other's
   *  state — one shared `busy` flag would grey out the whole page. */
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  const setFromPayload = useReviewStore((s) => s.setFromPayload);

  const load = useCallback(async () => {
    try {
      const next = await reviewApi.get();
      setPayload(next);
      setFromPayload(next);
      setLoadError(null);
    } catch {
      setLoadError('Could not load your review list. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [setFromPayload]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // Separate from `load()` on purpose: the review list is the page and the
    // coins are an ornament on it. A failing wallet must not take the list
    // down, and a slow one must not hold it back.
    void coinService.getWallet()
      .then((wallet) => setActCoins(new Map(wallet.acts.map((a) => [a.slug, a.coins]))))
      .catch(() => { /* no badges; the list is unaffected */ });
  }, []);

  useEffect(() => {
    // Only needed for the third section's picker, and it is fine for it to
    // arrive late — the rest of the page does not wait on it.
    categoriesApi.getAll()
      .then((res) => setCategories(res.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  /**
   * Run one row's action, then take the server's answer as the new truth.
   *
   * *** THE COUNTS ARE NEVER DECREMENTED LOCALLY. *** Every confirm answers with
   * the whole refreshed page; an edit through another endpoint is followed by a
   * reload. Subtracting one here is how the badge and the list drift apart
   * (D-101), and how two open tabs end up disagreeing.
   */
  const act = useCallback(async (
    key: string,
    run: () => Promise<ReviewPayload | void>,
  ) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setRowErrors((e) => { const next = { ...e }; delete next[key]; return next; });
    try {
      const result = await run();
      if (result) {
        setPayload(result);
        setFromPayload(result);
      } else {
        await load();
      }
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: string } } })?.response;
      setRowErrors((e) => ({
        ...e,
        // The server's own words. A 403 here means "ask the person who owns it",
        // which is a different instruction from "something went wrong".
        [key]: response?.data?.error ?? 'That did not go through. Try again.',
      }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [load, setFromPayload]);

  const isEmpty = useMemo(() => payload !== null && payload.total === 0, [payload]);

  if (loading) {
    return (
      <div style={pageContainerStyle}>
        <div className="page-container" style={{ display: 'flex', alignItems: 'center',
                                                 gap: 8, color: 'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" size={18} /> Loading your review list…
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainerStyle}>
      <div className="page-container">
        <PageHead
          band="review"
          title="Review"
          subtitle="Everything finPal had to guess. Confirm it or correct it — either way it stops being a guess."
        />

        {loadError && (
          <div style={{ ...sectionCardStyle, padding: 16, color: '#ef4444' }}>
            {loadError}
          </div>
        )}

        {isEmpty && !loadError && (
          /* *** NOT THREE EMPTY HEADINGS. *** A page that renders its own
             scaffolding when there is nothing to do reads as broken, and this
             one is supposed to be finishable. */
          <div style={{ ...sectionCardStyle, padding: '40px 24px', textAlign: 'center' }}>
            <Sparkles size={28} style={{ color: '#22c55e' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 4px',
                         color: 'var(--text-primary)' }}>
              Nothing to review
            </h2>
            <p className="fp-hint" style={{ margin: 0 }}>
              Everything finPal guessed, you have already answered.
            </p>
          </div>
        )}

        {payload && payload.counts.categories > 0 && (
          <section style={sectionCardStyle}>
            <SectionHeader
              title="Spending groups finPal guessed"
              coins={actCoins.get('categories_classified')}
              blurb="Fixed means committed by contract, not essential. Groceries are flexible — you must eat, and you still choose weekly."
              count={payload.counts.categories}
            />
            {payload.sections.categories.rows.map((row) => {
              const key = `category:${row.id}`;
              return (
                <div key={key} style={rowStyle}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.parent_name ? `${row.parent_name} › ${row.name}` : row.name}
                    </div>
                    <p className="fp-hint" style={{ margin: '2px 0 0' }}>{row.reason}</p>
                    {rowErrors[key] && <RowError message={rowErrors[key]} />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      aria-label={`Spending group for ${row.name}`}
                      style={selectStyle}
                      value={row.spending_type ?? ''}
                      disabled={busy[key]}
                      /* Correcting goes through the ordinary category endpoint,
                         which now marks the group as the user's — so a
                         correction clears the row exactly like a confirmation
                         does. Two ways off this page, and no way to be stuck
                         on it. */
                      onChange={(e) => {
                        // Narrowed through GROUP_ORDER rather than cast: the
                        // list the options are BUILT from is the list the value
                        // is checked against, so the two cannot drift, and an
                        // unexpected value falls to null ("unsorted") instead of
                        // reaching the API as junk. A cast here would be a claim
                        // rather than a check.
                        const raw = e.target.value;
                        const value = GROUP_ORDER.find((g) => g === raw) ?? null;
                        void act(key, async () => {
                          await categoriesApi.update(row.id, { spending_type: value });
                        });
                      }}
                    >
                      <option value="">{UNSORTED_LABEL}</option>
                      {GROUP_ORDER.map((g) => (
                        <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={confirmButtonStyle}
                      disabled={busy[key]}
                      onClick={() => void act(key, () => reviewApi.confirmCategory(row.id))}
                    >
                      {busy[key] ? <Loader2 className="animate-spin" size={15} />
                                 : <Check size={15} />}
                      Looks right
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {payload && payload.counts.accounts > 0 && (
          <section style={sectionCardStyle}>
            <SectionHeader
              title="Account types finPal worked out"
              coins={actCoins.get('accounts_confirmed')}
              blurb="Your bank did not say what kind of account these are, so finPal read it from the balance and the name."
              count={payload.counts.accounts}
            />
            {payload.sections.accounts.rows.map((row) => {
              const key = `account:${row.id}`;
              return (
                <div key={key} style={rowStyle}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.name}
                    </div>
                    <p className="fp-hint" style={{ margin: '2px 0 0' }}>
                      {row.balance !== null
                        ? `Balance ${formatMoney(row.balance)}`
                        : row.reason}
                    </p>
                    {rowErrors[key] && <RowError message={rowErrors[key]} />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      aria-label={`Account type for ${row.name}`}
                      style={selectStyle}
                      value={row.type ?? ''}
                      disabled={busy[key]}
                      onChange={(e) => {
                        const value = e.target.value;
                        void act(key, async () => {
                          await accountService.updateAccount(row.id, { account_type: value });
                        });
                      }}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={confirmButtonStyle}
                      disabled={busy[key]}
                      onClick={() => void act(key, () => reviewApi.confirmAccount(row.id))}
                    >
                      {busy[key] ? <Loader2 className="animate-spin" size={15} />
                                 : <Check size={15} />}
                      Looks right
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {payload && payload.counts.uncategorised > 0 && (
          <section style={sectionCardStyle}>
            <SectionHeader
              title="Transactions with no category"
              coins={actCoins.get('transactions_categorised')}
              blurb="finPal has no opinion about these — transfers between your own accounts are left out, because there is nothing to categorise there."
              count={payload.counts.uncategorised}
            />
            {payload.sections.uncategorised.rows.map((row) => {
              const key = `transaction:${row.id}`;
              return (
                <div key={key} style={rowStyle}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.description || 'No description'}
                    </div>
                    <p className="fp-hint" style={{ margin: '2px 0 0' }}>
                      {formatRowDate(row.date)} · {row.amount !== null ? formatMoney(row.amount) : '—'}
                    </p>
                    {rowErrors[key] && <RowError message={rowErrors[key]} />}
                  </div>
                  {/* *** NO CONFIRM BUTTON HERE, DELIBERATELY. *** finPal never
                      guessed, so there is nothing to agree with. */}
                  <select
                    aria-label={`Category for ${row.description || 'this transaction'}`}
                    style={selectStyle}
                    value=""
                    disabled={busy[key]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!value) return;
                      void act(key, async () => {
                        await transactionsApi.update(row.id, { category_id: value });
                      });
                    }}
                  >
                    <option value="">Choose a category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}

            {/* *** THE CONSEQUENCE, WHICH THE SECTION NEVER STATED. ***
                The list said what was uncategorised and not what leaving it
                alone costs. On the demo all six rows are the same transfer
                into a savings account, every one recorded as `income` — so
                $1,900.00 of moving money between your own accounts is sitting
                inside what finPal believes you EARN, and every income figure
                on the dashboard, Analytics and the reports is built on it.

                *** COMPUTED FROM THE ROWS, NOT WRITTEN AS A SENTENCE. ***
                Only rows this payload actually carries, only the ones typed
                `income`, and only when there are some — a page that hardcoded
                "$1,900" would be wrong for every user but this demo, which is
                the fabricated-figure habit this project has already found ten
                sites of.

                NOT "and then income drops to X": that would need to know which
                of these the user will reclassify, and the honest version of
                that sentence is the one they produce by acting. */}
            {(() => {
              const inflating = payload.sections.uncategorised.rows
                .filter((row) => row.transaction_type === 'income' && row.amount !== null);
              if (!inflating.length) return null;
              const total = inflating.reduce((sum, row) => sum + (row.amount ?? 0), 0);
              return (
                <p className="fp-hint" style={{
                  margin: 0, padding: '14px 16px',
                  borderTop: '1px solid var(--border-light)',
                  lineHeight: 1.6,
                }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(total)}</strong>
                  {' '}across {inflating.length}{' '}
                  {inflating.length === 1 ? 'row is' : 'rows are'} recorded as money
                  coming in. Until you say otherwise, that counts as income
                  everywhere in finPal — so anything moved between your own
                  accounts is inflating what you appear to earn.
                </p>
              );
            })()}
          </section>
        )}

        {payload && !isEmpty && (
          <p className="fp-hint" style={{ marginTop: 8 }}>
            Changed your mind later? Everything here is editable from{' '}
            <Link to="/categories" style={inlineLinkStyle}>Categories</Link>,{' '}
            <Link to="/accounts" style={inlineLinkStyle}>Accounts</Link> and{' '}
            <Link to="/transactions" style={inlineLinkStyle}>Transactions</Link> as usual.
          </p>
        )}
      </div>
    </div>
  );
}
