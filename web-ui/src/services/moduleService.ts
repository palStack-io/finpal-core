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
 */
export const moduleService = {
  /** Slugs this user has hidden. */
  async getHidden(): Promise<string[]> {
    const response = await api.get<{ success: boolean; hidden: string[] }>(
      '/users/module-preferences');
    return response.data.hidden ?? [];
  },

  /**
   * Show or hide one module. Returns the WHOLE hidden list, so the caller
   * never reconstructs state it can simply be handed.
   */
  async setVisible(slug: string, visible: boolean): Promise<string[]> {
    const response = await api.put<{ success: boolean; hidden: string[] }>(
      `/users/module-preferences/${slug}`, { visible });
    return response.data.hidden ?? [];
  },
};
