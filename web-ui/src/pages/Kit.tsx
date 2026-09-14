import React, { useEffect, useState } from 'react';

import { GearIcon } from '../components/GearIcon';
import { CoinPurse } from '../components/coins/CoinPurse';
import { coinService, type CoinWallet } from '../services/coinService';

/**
 * Your kit — where coins go.
 *
 * *** THE GEAR IS DRAWN AT 46px, AND THE APP HAS ALWAYS RENDERED IT AT 14. ***
 * All twenty-one pieces have existed as real line art since 2026-09-11
 * (`public/gear/*.svg`), and every surface showed them in a row of five at a
 * size where a boot and a compass are indistinguishable. Nothing needed drawing
 * for this page; the art needed room.
 *
 * *** THE SAVINGS BAR IS THE ONLY PROGRESS BAR finPal MAY DRAW. *** Design
 * decision 5 forbids a denominator unless the user chose the target — and a
 * gear price is a target they chose. Every other bar in the product came out
 * on 2026-09-14. Do not add a second one here for "coins earned".
 *
 * *** GEAR GATES NOTHING. *** Not a goal, not a figure, not a feature. Owner
 * decision: *"we dont gate the bigger goals and all."* If a future change makes
 * a piece of kit a precondition for anything, it has stopped being cosmetic and
 * has become a punishment mechanic in a friendly hat.
 */
export const Kit: React.FC = () => {
  const [wallet, setWallet] = useState<CoinWallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setWallet(await coinService.getWallet());
    } catch {
      setError('Your kit could not be loaded.');
    }
  };

  useEffect(() => { load(); }, []);

  const buy = async (slug: string) => {
    setBusy(slug);
    setError(null);
    try {
      await coinService.buy(slug);
      await load();
    } catch (err: unknown) {
      /* *** 402 AND 409 ARE DIFFERENT ANSWERS AND ARE NOT COLLAPSED HERE. ***
         "You cannot afford this yet" and "you already own this" ask the user for
         completely different things; the server distinguishes them deliberately
         and a single catch-all message would throw that away. `err.response`
         shape per axios; the server sends `{error}` rather than restx's
         `{message}` because that is what this app reads. */
      const res = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      if (res?.status === 402) setError('Not enough coins yet — keep going.');
      else if (res?.status === 409) setError('You already own that.');
      else setError(res?.data?.error ?? 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  /* *** A FAILED FETCH MUST NOT COST THE PAGE ITS OWN HEADING. *** The first
     version returned the alert alone, so a user whose request failed saw a bare
     red sentence with no idea which page they were on — and `pageIsLoaded`
     could not find the h1, which is how the e2e run surfaced it. `fixtures.ts`
     describes the right shape from the Goals page: heading present, and an
     alert where the data should have been. */
  if (error && !wallet) {
    return (
      <div>
        <h1 className="page-title">Your kit</h1>
        <div role="alert" style={{ color: 'var(--danger-text)', marginTop: 10 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!wallet) {
    return (
      <div>
        <h1 className="page-title">Your kit</h1>
        <div aria-label="Loading your kit" style={{ color: 'var(--text-secondary)', marginTop: 10 }}>
          Loading…
        </div>
      </div>
    );
  }

  /* The cheapest piece you cannot YET afford is the one being saved for.
     `undefined` when the kit is complete, or when everything left is already
     affordable — both are honest ends, not states to pad.

     *** "CANNOT YET AFFORD" IS THE WHOLE CONDITION, AND THE FIRST VERSION
     OMITTED IT. *** It took the cheapest unowned piece outright, so a user with
     7,853 coins saw "7,853 / 200" under a 200-coin item they could buy twice
     over. A savings bar for something already in reach is not progress, it is
     noise — and no test caught it because every fixture had a balance smaller
     than the cheapest price. Found by looking at the deployed demo. */
  const nextUp = wallet.gear
    .filter((g) => !g.owned && wallet.balance < g.price)
    .sort((a, b) => a.price - b.price)[0];

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
        marginBottom: 6,
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="page-title">Your kit</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0', fontSize: 14 }}>
            Coins come from telling finPal the truth about your own money. Kit is
            what you spend them on — it looks good and it gates nothing.
          </p>
        </div>
        <CoinPurse balance={wallet.balance} />
      </div>

      {error && (
        <div role="alert" style={{
          color: 'var(--danger-text)', fontSize: 14, margin: '10px 0 0',
        }}>{error}</div>
      )}

      <div
        data-testid="kit-grid"
        style={{
          display: 'grid', gap: 12, marginTop: 18,
          gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        }}
      >
        {wallet.gear.map((g) => {
          const affordable = wallet.balance >= g.price;
          const saving = nextUp?.slug === g.slug;
          return (
            <div
              key={g.slug}
              data-testid={`gear-${g.slug}`}
              style={{
                background: g.owned ? 'var(--surface-hover)' : 'var(--bg-card)',
                border: `1px solid ${g.owned ? 'var(--brand-main-green)' : 'var(--border-light)'}`,
                borderRadius: 16, padding: '15px 10px 12px', textAlign: 'center',
              }}
            >
              {/* 46px, not 14. See the file docstring. `opacity` carries
                  out-of-reach, because a greyed icon still shows its shape. */}
              <div style={{ opacity: g.owned || affordable ? 1 : 0.32 }}>
                <GearIcon slug={g.slug} size={46} />
              </div>
              <div style={{
                fontSize: 12.5, fontWeight: 500, marginTop: 8,
                textTransform: 'capitalize', color: 'var(--text-primary)',
              }}>
                {g.slug.replace(/-/g, ' ')}
              </div>

              {g.owned ? (
                <div style={{
                  fontSize: 12, fontWeight: 600, marginTop: 2,
                  color: 'var(--g-ink)',
                }}>
                  owned
                </div>
              ) : (
                <>
                  <div style={{
                    fontSize: 12, marginTop: 2, color: 'var(--text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {saving
                      ? `${wallet.balance.toLocaleString()} / ${g.price.toLocaleString()}`
                      : g.price.toLocaleString()}
                  </div>
                  {saving && (
                    /* THE one permitted progress bar — the user chose this
                       target by saving toward it. */
                    <div
                      data-testid="gear-saving-bar"
                      aria-hidden="true"
                      style={{
                        height: 4, borderRadius: 99, marginTop: 7,
                        background: 'var(--progress-track)', overflow: 'hidden',
                      }}
                    >
                      <div style={{
                        width: `${Math.min(100, (wallet.balance / g.price) * 100)}%`,
                        height: '100%', background: '#C9A227',
                      }} />
                    </div>
                  )}
                  {affordable && (
                    <button
                      type="button"
                      onClick={() => buy(g.slug)}
                      disabled={busy === g.slug}
                      /* *** A QUIET BUTTON, AND THE REASON IS NOT "IT WAS
                         LOUD" — IT IS THAT GREEN MEANT TWO THINGS. *** A filled
                         green Buy sat inside a card whose GREEN BORDER means
                         "owned", so the same colour carried both *you have
                         this* and *spend here*. Eighteen filled buttons down a
                         page also gave equal urgency to a screen where nothing
                         is urgent.

                         Now green means one thing — owned — and buying is an
                         outlined action. `--g-ink` is the theme-aware link ink
                         (6.92 / 8.21), not the fill token: white on
                         `--brand-main-green` is fine at 5.02:1 but this is text
                         on a card, not on green. */
                      style={{
                        marginTop: 9, width: '100%',
                        background: 'transparent', color: 'var(--g-ink)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 9, padding: '6px 0',
                        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {busy === g.slug ? '…' : 'Buy'}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          What your coins came from
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '0 0 12px' }}>
          Every one of these made a figure finPal shows you true.
        </p>
        {wallet.acts.map((a) => (
          <div
            key={a.slug}
            data-testid={`act-${a.slug}`}
            style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '11px 0', borderTop: '1px solid var(--border-light)',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 500 }}>{a.title}</div>
              {/* *** NULL RENDERS NOTHING. *** Not a placeholder — the server
                  returns null when it cannot compute the consequence, and a
                  fallback here would reintroduce the bluffing bug fixed on
                  2026-09-14. */}
              {a.revealed && (
                <p style={{
                  margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                }}>
                  {a.revealed}
                </p>
              )}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              color: a.coins > 0 ? 'var(--g-ink)' : 'var(--text-secondary)',
            }}>
              {a.coins > 0 ? `+${a.coins.toLocaleString()}` : '—'}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
