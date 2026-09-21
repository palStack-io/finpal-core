import React, { useEffect, useState } from 'react';

import { GearIcon } from '../components/GearIcon';
import { BadgeIcon } from '../components/BadgeIcon';
import { PageHead } from '../components/PageHead';
import { CoinPurse } from '../components/coins/CoinPurse';
import { coinService, type CoinWallet } from '../services/coinService';
import { pageContainerStyle, pageMaxWidthStyle } from '../styles/layoutStyles';

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
/* One sentence, three branches. It was only on the main one before, so a user
   whose wallet failed to load got a heading with nothing under it saying what
   the page is. */
const KIT_SUBTITLE = 'Coins come from telling finPal the truth about your own '
  + 'money. Kit is what you spend them on — it looks good and it gates nothing.';

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
      {/* `PageHead`, like every other page — see the note on the main branch. */}
        <PageHead band="kit" title="Your kit" subtitle={KIT_SUBTITLE} />
        <div role="alert" style={{ color: 'var(--danger-text)', marginTop: 10 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!wallet) {
    return (
      <div>
      {/* `PageHead`, like every other page — see the note on the main branch. */}
        <PageHead band="kit" title="Your kit" subtitle={KIT_SUBTITLE} />
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

  /* *** PARTITIONED ON `coins` ALONE, AND EXHAUSTIVELY — WHICH THE FIRST
     VERSION WAS NOT. *** It read `coins === 0 && a.open`, and an act arriving
     without `open` then belonged to NEITHER list and simply stopped being
     drawn. A row in the wrong list is visible; a row in no list is not, and
     this page is the only inventory of what earns coins there is.

     `open` would have added nothing anyway: an act at zero coins definitionally
     still has its work outstanding, which is the only question this heading
     asks. It stays on the type because the cairns read it. */
  const earnedActs = wallet.acts.filter((a) => a.coins > 0);
  const openActs = wallet.acts.filter((a) => a.coins <= 0);
  /* `?? []` because a backend older than `earned_badges` omits the key, and
     `.length` on `undefined` is what throws. */
  const badges = wallet.badges ?? [];

  return (
    /* *** THE BARE `<div>` HERE WAS THE PADDING BUG THE OWNER SPOTTED ON THE
       DEMO (2026-09-17). *** Every other content page wraps in
       `pageContainerStyle` (24px) plus the 1400px max-width, and `.main-content`
       deliberately carries NO horizontal padding of its own — it only reserves
       the sidebar's width. So a page that forgets the wrapper renders flush to
       the viewport edge: the gear grid's last column and every act row's coin
       figure touched x=1440, while `PageHead` looked correctly inset because it
       supplies its own padding. That mismatch is exactly what reads as "off".
       Adopted rather than hand-padded, so this page cannot drift from the
       others again. */
    <div style={pageContainerStyle}>
      <div style={pageMaxWidthStyle}>
      {/* *** THE APP'S HEAD, AND THE PURSE IS WHAT `right` IS FOR. ***
          This page hand-rolled its own flex row with an `h1.page-title`, a
          sentence and the purse pushed to the end — which is `PageHead`'s
          exact shape, built by hand, for the third time in this file (the
          loading and error branches each had a bare copy of the heading).

          *** AND A SHEET OF MINE WAS WRONG ABOUT THIS PAGE. ***
          `docs/mockups/orphan-pages-web.html` argued that `/kit` should stay
          un-headed because "a style kit wearing the style it documents cannot
          show you the style". `/kit` is not a style kit. It is this — where
          coins go — and that whole argument was about a page that does not
          exist. The sheet has been corrected. Owner asked for the redesign on
          2026-09-16, and it is a route in the sidebar that every user can
          reach, not an internal tool.

          The band carries a cairn; see `headBands.ts` for why that shape and
          not a trophy. */}
      <PageHead
        band="kit"
        title="Your kit"
        subtitle={KIT_SUBTITLE}
        right={<CoinPurse balance={wallet.balance} />}
      />

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

      {/* *** TWO LISTS, BECAUSE ONE HEADING WAS DESCRIBING BOTH (FINPAL-30). ***
          `wallet.acts` carries earned acts and unearned ones together, and they
          were all rendered under "What your coins came from" — so an act the
          user has never done sat under a heading claiming it paid them, with a
          dash where its figure would be. That is D-102's shape: a caption that
          does not describe the row beside it.

          *** AND THE SECOND LIST CARRIES NO FIGURE, DELIBERATELY. *** No
          ceiling goes on the wire (decision 5), so this page cannot say what an
          act is worth without inventing it — and "+2,500 available" on
          something with a predicate the user may not even qualify for is the
          bluffing bug one surface over. The titles are imperative on purpose;
          they are the whole answer. */}
      {earnedActs.length > 0 && (
      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          What your coins came from
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '0 0 12px' }}>
          Every one of these made a figure finPal shows you true.
        </p>
        {earnedActs.map((a) => (
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
      )}

      {openActs.length > 0 && (
      <section style={{ marginTop: 30 }} data-testid="acts-open">
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          What else earns coins
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '0 0 12px' }}>
          Nothing here is busywork — each one makes a figure finPal shows you true.
        </p>
        {openActs.map((a) => (
          <div
            key={a.slug}
            data-testid={`act-open-${a.slug}`}
            style={{
              fontSize: 14.5, padding: '11px 0',
              borderTop: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            {a.title}
          </div>
        ))}
      </section>
      )}
      {/* *** THE WALLET HAS SENT `badges` SINCE THE ECONOMY SHIPPED AND NO
          CLIENT READ IT. *** Seven badges — `debt-clear`, `goal-reached`, the
          three on-budget runs and the two on-plan runs — were earned, stored
          and invisible, which is D-187's shape: a payload is not proof
          anything renders it. AUDIT D-274.

          *** EARNED ONES ONLY, AND THE SECTION IS ABSENT WHEN THERE ARE
          NONE. *** A locked grid would read as "you have not paid your debt",
          which is the report card decision 5 forbids. */}
      {badges.length > 0 && (
      <section style={{ marginTop: 30 }} data-testid="badges">
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>
          What you have kept up
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: '0 0 12px' }}>
          These are not bought and never taken back — a hard month cannot
          remove one you have already earned.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {badges.map((b) => (
            <div
              key={b.slug}
              data-testid={`badge-${b.slug}`}
              style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '10px 13px', borderRadius: 10,
                border: '1px solid var(--border-light)',
              }}
            >
              <BadgeIcon slug={b.slug} size={32} title={b.title} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{b.title}</div>
                {b.earned_at && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    {new Date(b.earned_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      </div>
    </div>
  );
};
