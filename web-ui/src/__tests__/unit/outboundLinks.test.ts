import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  FINPAL_DOCS, FINPAL_PRIVACY, FINPAL_SITE, FINPAL_TERMS,
} from '../../constants/links';

/**
 * The same guard mobile has, because the same bug happened here.
 *
 * *** THE REGISTER PAGE LINKED "Terms of Service" AND "Privacy Policy" TO
 * `/terms` AND `/privacy` — RELATIVE PATHS THAT ARE NOT ROUTES. *** They fell
 * through to the catch-all, so the one screen where a user is asked to AGREE to
 * something bounced them off the form when they tried to read it. Nothing caught
 * it: a URL in an `href` is a string, `tsc` has no opinion, and the walks render
 * captured markup without following a link.
 *
 * Measured against the live host, 2026-09-13:
 *
 *     https://palstack.io/finpal/privacy   -> 200  ("finPal — Privacy Policy")
 *     https://palstack.io/finpal/docs      -> 200
 *     https://palstack.io/finpal/docs/     -> 404   <- the trailing slash matters
 *
 * Offline on purpose: a test that curls the real host fails on a plane, and a
 * gate that goes red for reasons unrelated to the code is one people start
 * skipping.
 */
describe('outbound links', () => {
  const urls = Object.entries({
    FINPAL_SITE, FINPAL_DOCS, FINPAL_PRIVACY, FINPAL_TERMS,
  });

  it('*** NEVER CARRY A TRAILING SLASH ***', () => {
    expect(urls.filter(([, u]) => u.endsWith('/'))).toEqual([]);
  });

  it('are absolute and https — a relative path here is not a route', () => {
    // This is the exact Register-page defect: `/terms` looks like a link and is
    // a catch-all redirect.
    expect(urls.filter(([, u]) => !u.startsWith('https://'))).toEqual([]);
  });

  it('never point at the subdomain that does not exist', () => {
    expect(urls.filter(([, u]) => u.includes('finpal.palstack.io'))).toEqual([]);
  });

  it('use finPal’s own legal pages, not palStack’s', () => {
    // `palstack.io/privacy` is a real page (200) about the whole family, which
    // is why linking to it looked fine. finPal has its own.
    expect(FINPAL_PRIVACY).toContain('/finpal/');
    expect(FINPAL_TERMS).toContain('/finpal/');
  });

  it('*** ARE THE ONLY PLACE A palstack.io URL IS SPELLED OUT ***', () => {
    const SRC = join(process.cwd(), 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry)) continue;
        if (full.endsWith(join('constants', 'links.ts'))) continue;
        const src = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const m of src.matchAll(/https:\/\/[a-z.]*palstack\.io[a-z/]*/g)) {
          offenders.push(`${full.replace(SRC, 'src')}: ${m[0]}`);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
