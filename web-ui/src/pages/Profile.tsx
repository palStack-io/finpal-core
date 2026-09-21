import React from 'react';
import { Link } from 'react-router-dom';
import { GearIcon } from '../components/GearIcon';
import { BadgeIcon } from '../components/BadgeIcon';
import { PageHead } from '../components/PageHead';
import { useAuthStore } from '../store/authStore';
import { useBadges, useCoinAwards, useEverest } from '../contexts/CoinAwardContext';
import { pageContainerStyle } from '../styles/layoutStyles';

/**
 * What you have done — as distinct from what you can buy.
 *
 * *** KIT IS THE SHOP; THIS IS THE MANTELPIECE. *** Owner, 2026-09-20:
 * *"a profile page that just has a shelf where all their kits live along with
 * their accomplishments"*. Kit keeps the 21-piece grid with prices and Buy
 * buttons, and the acts that pay for them. This page shows what you OWN and
 * what you have KEPT UP. Two pages, two jobs — the badges section moved here
 * rather than being duplicated.
 *
 * *** AND UNTIL TODAY "View profile" IN THE RAIL WENT TO /settings. *** There
 * was no profile page at all; the link had been pointing at the preferences
 * screen since the rail was built.
 *
 * *** NO UNOWNED GEAR, DELIBERATELY. *** A wall of greyed-out pieces is the
 * locked-grid shape the product refuses for badges, for the same reason: it
 * turns a page about what you have done into a list of what you have not.
 * The shop already shows all 21, and the count below says how many are left.
 */
export const Profile: React.FC = () => {
  const { user } = useAuthStore();
  const { ownedGear } = useCoinAwards();
  const badges = useBadges();
  const everest = useEverest();

  const owned = [...ownedGear].sort((a, b) => a.price - b.price);

  return (
    <div style={pageContainerStyle}>
      <div className="page-container">
        <PageHead
          band="kit"
          title={user?.name || 'Your climb'}
          subtitle={
            everest
              /* *** METRES, NOT A TIER NAME. *** The tier ladder is undecided
                 (owner, 2026-09-20), and inventing a rung name here would put
                 a label under somebody's name that nothing else in the
                 product agrees with. Everest is the one figure allowed a
                 ceiling, because it measures effort and not money. */
              ? `${everest.altitude_m.toLocaleString()} m of ${everest.summit_m.toLocaleString()} on the shared climb`
              : 'Everything you have earned, in one place.'
          }
        />

        <section
          data-testid="profile-shelf"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
            borderRadius: 14, padding: '18px 20px', marginBottom: 16,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 14,
          }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your shelf</h2>
            <span className="fp-hint" style={{ fontSize: 12.5 }}>
              {owned.length} of 21
            </span>
          </div>

          {owned.length === 0 ? (
            /* *** SAYS WHAT TO DO, RATHER THAN DRAWING AN EMPTY SHELF. ***
               An empty state that only says "nothing here" is a dead end. */
            <p className="fp-hint" style={{ margin: 0, lineHeight: 1.55 }}>
              Nothing on the shelf yet. Coins come from telling finPal the
              truth about your own money, and kit is what you spend them on.{' '}
              <Link to="/kit" style={{ color: 'var(--g-ink)', fontWeight: 600 }}>
                Go and look →
              </Link>
            </p>
          ) : (
            <>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end',
              }}>
                {owned.map((g) => (
                  <div key={g.slug} data-testid={`shelf-${g.slug}`}
                       style={{ width: 74, textAlign: 'center' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'center',
                      alignItems: 'flex-end', height: 48,
                    }}>
                      {/* 44px, well above the 18px legibility floor — this is
                          the one place the art is meant to be looked AT. */}
                      <GearIcon slug={g.slug} size={44} />
                    </div>
                    <div className="fp-hint" style={{
                      fontSize: 11.5, marginTop: 6, textTransform: 'capitalize',
                    }}>
                      {g.slug.replace(/-/g, ' ')}
                    </div>
                  </div>
                ))}
              </div>
              {/* The shelf itself. Decoration, and marked as such for a
                  screen reader, which has the count above it already. */}
              <div aria-hidden="true" style={{
                height: 3, borderRadius: 2, marginTop: 10,
                background: 'var(--border-medium)', opacity: 0.85,
              }} />
              <p className="fp-hint" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
                {21 - owned.length === 0
                  ? 'Every piece is yours.'
                  : `${21 - owned.length} more in the shop. `}
                <Link to="/kit" style={{ color: 'var(--g-ink)', fontWeight: 600 }}>
                  Go and look →
                </Link>
              </p>
            </>
          )}
        </section>

        {/* *** ABSENT WHEN THERE ARE NONE, NEVER A LOCKED GRID. *** An
            unearned badge is absent rather than present-and-false, which is
            the property that makes an outcome-shaped reward safe at all. */}
        {badges.length > 0 && (
          <section
            data-testid="profile-badges"
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-light)',
              borderRadius: 14, padding: '18px 20px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              What you have kept up
            </h2>
            <p className="fp-hint" style={{ margin: '4px 0 14px', lineHeight: 1.55 }}>
              These are not bought and never taken back — a hard month cannot
              remove one you have already earned.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {badges.map((b) => (
                <div
                  key={b.slug}
                  data-testid={`profile-badge-${b.slug}`}
                  style={{
                    display: 'flex', gap: 11, alignItems: 'center',
                    border: '1px solid var(--border-light)',
                    borderRadius: 11, padding: '11px 14px',
                  }}
                >
                  <BadgeIcon slug={b.slug} size={42} title={b.title} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{b.title}</div>
                    {b.earned_at && (
                      <div className="fp-hint" style={{ fontSize: 12.5 }}>
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

export default Profile;
