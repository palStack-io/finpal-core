import { describe, it, expect } from 'vitest';

import { rangeIsHiddenByChoice } from '../../modules/learnpal/RangeHiddenNote';

/**
 * *** THE ASSERTIONS THAT MATTER HERE ARE THE SILENCES. ***
 *
 * A prompt saying "enable learnPal" is right for exactly one person: somebody who
 * HAS learnPal and switched it off. Shown to anybody else it is a nag about a
 * thing they cannot change — and `service.ts` already refuses the harsher version
 * of the same mistake, in as many words: treating a 404 as an error "would put a
 * red banner on the goals page of every deployment that simply does not use
 * learnPal".
 *
 * `user.modules` is the server's list of modules that are **enabled AND
 * permitted** (`_get_user_modules`), so a deployment with `LEARNPAL_ENABLED`
 * unset and a user who was never entitled look identical from here — and neither
 * is a prompt, which is why collapsing them costs nothing.
 */
describe('the range-hidden note', () => {
  const u = (modules?: string[], hidden?: string[]) =>
    ({ modules, hidden_modules: hidden });

  it('shows for a user who HAS learnPal and hid it', () => {
    expect(rangeIsHiddenByChoice(u(['learnpal'], ['learnpal']))).toBe(true);
  });

  it('*** SAYS NOTHING TO A DEPLOYMENT THAT DOES NOT RUN learnPal ***', () => {
    // `modules` is empty because the namespace is not registered at all. There
    // is no switch on any screen for this person to flip.
    expect(rangeIsHiddenByChoice(u([], []))).toBe(false);
    expect(rangeIsHiddenByChoice(u())).toBe(false);
  });

  it('*** SAYS NOTHING TO A USER WHO WAS NEVER GRANTED IT ***', () => {
    // Hidden without granted is not a state Settings can produce, but a stale
    // preference row could leave it — and "turn on a thing you do not have" is
    // the worst of both.
    expect(rangeIsHiddenByChoice(u(['pointspal'], ['learnpal']))).toBe(false);
  });

  it('says nothing to a user who has learnPal and has NOT hidden it', () => {
    // They see the real range. A note beside it would be noise, and if the range
    // is missing for some other reason, this is not the explanation.
    expect(rangeIsHiddenByChoice(u(['learnpal'], []))).toBe(false);
    expect(rangeIsHiddenByChoice(u(['learnpal'], ['pointspal']))).toBe(false);
  });

  it('says nothing when there is no user at all', () => {
    expect(rangeIsHiddenByChoice(null)).toBe(false);
  });

  it('reads the slug from the manifest rather than a second spelling', async () => {
    // Two spellings of one slug is how a guard goes blind — this project has hit
    // that twice. If the manifest's slug ever changes, this fails rather than
    // silently never matching again.
    const { MODULE_SLUG } = await import('../../modules/learnpal/manifest');
    expect(rangeIsHiddenByChoice(u([MODULE_SLUG], [MODULE_SLUG]))).toBe(true);
  });
});
