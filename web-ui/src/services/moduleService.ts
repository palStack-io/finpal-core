import { api } from './api';

/**
 * A user's per-module show/hide preference.
 *
 * *** PREFERENCE, NOT ENTITLEMENT, AND THEY ARE DIFFERENT TABLES SERVER-SIDE ***
 * (owner decision, 2026-09-11). `user.modules` answers *may you use this* and is
 * adminPal's to grant; this answers *do you want to see it* and is the user's.
 * One row meaning both would let an adminPal sync silently erase a choice.
 *
 * Before this, the toggle wrote `module_hidden_${slug}` to `localStorage` — a
 * per-BROWSER hide that did not follow the user to another device and that
 * mobile could not see at all.
 *
 * *** THE PATHS BELOW ARE ABSOLUTE, AND THEY WERE NOT UNTIL 2026-09-14 — D-211.
 * *** This file asked for `/users/module-preferences`, and `api`'s `baseURL` is
 * the EMPTY STRING in this client, so the request went to the SPA's own origin
 * and Vite answered **200 with index.html**. `response.data.hidden` on an HTML
 * string is `undefined`, the `?? []` turned that into "nothing is hidden", and
 * `setVisible` reported success having written nothing. So hiding a module from
 * Settings has never worked since it shipped in #172 — and #172 REPLACED a
 * localStorage hide that did work, so the feature went backwards.
 *
 * Measured on the live demo: `/users/module-preferences` → **200 (HTML)**,
 * `/api/v1/users/module-preferences` → **401**. Identical to the `/coins` bug
 * found hours earlier; the `??` fallback is what made this one silent.
 */
export const moduleService = {
  /** Slugs this user has hidden. */
  async getHidden(): Promise<string[]> {
    const response = await api.get<{ success: boolean; hidden: string[] }>(
      '/api/v1/users/module-preferences');
    return response.data.hidden ?? [];
  },

  /**
   * Show or hide one module. Returns the WHOLE hidden list, so the caller
   * never reconstructs state it can simply be handed.
   */
  async setVisible(slug: string, visible: boolean): Promise<string[]> {
    const response = await api.put<{ success: boolean; hidden: string[] }>(
      `/api/v1/users/module-preferences/${slug}`, { visible });
    return response.data.hidden ?? [];
  },
};
