/**
 * Module system type definitions.
 *
 * Every frontend module exports a ModuleManifest object from its manifest.ts.
 * The central registry (index.ts) collects all manifests into moduleRegistry[].
 * App.tsx and Sidebar.tsx iterate moduleRegistry filtered by user.modules.
 */

import type { LazyExoticComponent, ComponentType } from 'react';
import type { User } from '../types/user';

export interface NavLink {
  label: string;
  path: string;
  /** Return true if this link should show an alert badge */
  hasAlert?: (user: User | null) => boolean;
}

export interface ModuleRoute {
  path: string;
  component: LazyExoticComponent<ComponentType<any>>;
}

export interface ModuleManifest {
  /** Matches the backend module slug, e.g. 'pointspal' */
  slug: string;
  /** Display name shown in sidebar and Settings, e.g. 'pointsPal' */
  label: string;
  /** Emoji or symbol shown in sidebar, e.g. '✦' */
  icon: string;
  /** One-line description shown in Settings Modules tab */
  description: string;
  navLinks: NavLink[];
  routes: ModuleRoute[];
}
