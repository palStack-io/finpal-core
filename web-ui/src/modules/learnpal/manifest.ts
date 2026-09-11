import { lazy } from 'react';
import type { ModuleManifest } from '../registry';

/**
 * *** THE NAV AND ROUTES APPEAR ONLY WHEN `learnpal` IS IN `user.modules`. ***
 * `_get_user_modules` lists every backend module that is enabled AND permitted
 * for the user, so a deployment with `LEARNPAL_ENABLED` unset gets neither the
 * sidebar section nor the routes — matching the API, where the namespace is not
 * registered at all and every path 404s.
 */
const manifest: ModuleManifest = {
  slug: 'learnpal',
  label: 'learnPal',
  icon: '⛰',
  description:
    'Your goals as a range of mountains, with a lesson unlocked by your own '
    + 'figures rather than by a schedule.',
  // *** `/learnpal` IS THE HOME AND THE RANGE MOVED TO `/learnpal/range`. ***
  // The module's landing page used to BE the range, which made the one screen
  // that answers "what have I learned and what is next" a thing you had to know
  // to look for. The range is a visualisation; the home is the progression.
  //
  // Anything linking to `/learnpal` meaning "the range" has to move with it --
  // `RangeBanner`'s "See the whole range" was the one caller.
  navLinks: [
    { label: 'learnPal',   path: '/learnpal' },
    { label: 'Your range', path: '/learnpal/range' },
    { label: 'Lessons',    path: '/learnpal/lessons' },
  ],
  routes: [
    { path: '/learnpal',         component: lazy(() => import('./pages/Home')) },
    { path: '/learnpal/range',   component: lazy(() => import('./pages/Range')) },
    { path: '/learnpal/lessons', component: lazy(() => import('./pages/Lessons')) },
  ],
};

export default manifest;
