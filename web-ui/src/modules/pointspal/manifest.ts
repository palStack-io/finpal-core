import { lazy } from 'react';
import type { ModuleManifest } from '../registry';

const manifest: ModuleManifest = {
  slug: 'pointspal',
  label: 'pointsPal',
  icon: '✦',
  description: 'Track credit card points, spending caps, and get card recommendations.',
  navLinks: [
    { label: 'Overview',    path: '/pointspal' },
    { label: 'Cap Tracker', path: '/pointspal/caps', hasAlert: () => true },
    { label: 'Best Card',   path: '/pointspal/recommend' },
    { label: 'My Cards',    path: '/pointspal/cards' },
    { label: 'Redeem',      path: '/pointspal/redeem' },
  ],
  routes: [
    { path: '/pointspal',           component: lazy(() => import('./pages/Overview')) },
    { path: '/pointspal/caps',      component: lazy(() => import('./pages/CapTracker')) },
    { path: '/pointspal/recommend', component: lazy(() => import('./pages/BestCard')) },
    { path: '/pointspal/cards',     component: lazy(() => import('./pages/MyCards')) },
    { path: '/pointspal/redeem',    component: lazy(() => import('./pages/Redeem')) },
  ],
};

export default manifest;
