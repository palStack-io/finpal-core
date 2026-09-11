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
  navLinks: [
    { label: 'Your range', path: '/learnpal' },
    { label: 'Lessons',    path: '/learnpal/lessons' },
  ],
  routes: [
    { path: '/learnpal',         component: lazy(() => import('./pages/Range')) },
    { path: '/learnpal/lessons', component: lazy(() => import('./pages/Lessons')) },
  ],
};

export default manifest;
