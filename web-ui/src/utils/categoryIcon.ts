/**
 * A category's icon is an emoji, rendered as text. This makes sure nothing else is.
 *
 * The Categories page printed the literal string `fa-tag` where an icon belongs. Nothing
 * in web-ui was wrong: it renders `category.icon` directly, which is right for an emoji.
 * The value in the database was a FontAwesome class name, because `Category.icon`
 * defaulted to `"fa-tag"` and all 147 icons in `src/data/default_categories.py` were
 * FontAwesome names — from before web-ui moved to emoji. FontAwesome has never been a
 * dependency, so those names resolved to nothing and fell through as text.
 *
 * The real fix is upstream: the seed data and the three `'fa-tag'` defaults are emoji
 * now, and a migration converts existing rows through the 137-entry map in
 * `src/data/convert_icons_to_emoji.py`. This function is the third layer, and it earns
 * its place because the other two cannot cover everyone: a self-hoster who upgrades
 * without running migrations still has `fa-*` in their database, and finPal's schema
 * comes from `create_all()` rather than Alembic on a default deploy. Whatever is in the
 * row, the page must not show the user a class name.
 *
 * Deliberately NOT a copy of the backend's 137-entry map. Duplicating it here would give
 * two maps to keep in step for a legacy value that the migration is meant to remove; one
 * neutral placeholder is honest about not knowing which icon was meant, and it is
 * obvious in the UI that something needs converting.
 */

/** What a category with no usable icon shows. */
export const CATEGORY_ICON_FALLBACK = '📁';

/** True for a legacy FontAwesome class name, e.g. `fa-tag`, `fa-money-bill-wave`. */
export const isLegacyIconName = (icon: string | null | undefined): boolean =>
  typeof icon === 'string' && /^fa[srlbd]?-/.test(icon.trim());

/**
 * The emoji to render for a stored category icon.
 * Passes an emoji through untouched; replaces a FontAwesome name or an empty value.
 */
export function categoryIcon(icon: string | null | undefined): string {
  if (!icon) return CATEGORY_ICON_FALLBACK;
  const trimmed = icon.trim();
  if (!trimmed || isLegacyIconName(trimmed)) return CATEGORY_ICON_FALLBACK;
  return trimmed;
}
