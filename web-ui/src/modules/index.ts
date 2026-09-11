/**
 * Central module registry — the only file you edit when adding a new frontend module.
 *
 * Each entry must have its slug in the user.modules array (returned by the login API)
 * for its routes and nav to appear.
 */

import learnpal from './learnpal/manifest';
import pointspal from './pointspal/manifest';
import type { ModuleManifest } from './registry';

export const moduleRegistry: ModuleManifest[] = [
  pointspal,
  learnpal,
];

// To add a new module:
// import cryptopal from './cryptopal/manifest';
// Add cryptopal to the array above.
