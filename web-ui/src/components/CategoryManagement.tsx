import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, Folder, Search, X } from 'lucide-react';
import { categoriesApi, type Category } from '../services/api/categories';
import { Modal } from './Modal';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';
import { categoryIcon } from '../utils/categoryIcon';
import { SpendingTypeControl } from './budgets/SpendingTypeControl';
import { PageHead } from './PageHead';
import { TotalsRow } from './dashboard/TotalsRow';
import { SliceBreakdown } from './analytics/SliceBreakdown';
import { formatMoney } from '../styles/money';
import { analyticsService } from '../services/analyticsService';
import { lastFullMonth } from '../utils/monthKeys';
import { spendingTypeByName, splitSpendByGroup, SpendSplit } from '../utils/spendingGroups';
import { useSurfaceCoins } from '../contexts/CoinAwardContext';

/**
 * Where the "Hide these" choice for the suggested-categories panel lives (#125). A per-user
 * UI preference with no meaning to the API, so it stays in the browser rather than becoming
 * a `users` column — which on a default deploy `create_all()` would not add to an existing
 * install anyway (D-121).
 */
const SUGGESTIONS_DISMISSED_KEY = 'finpal.categorySuggestions.dismissed';

// Category icons mapping
const categoryIcons: Record<string, string> = {
  'Food & Dining': '🍔',
  'Transportation': '🚗',
  'Entertainment': '🎬',
  'Shopping': '🛍️',
  'Utilities': '⚡',
  'Healthcare': '🏥',
  'Housing': '🏠',
  'Income': '💰',
  'Savings': '🐷',
  'Travel': '✈️',
  'Education': '📚',
  'Fitness': '💪',
  'Groceries': '🛒',
  'Coffee & Tea': '☕',
  'Restaurants': '🍽️',
  'Gas': '⛽',
  'Parking': '🅿️',
  'Public Transit': '🚌',
  'Movies': '🎥',
  'Concerts': '🎵',
  'Gaming': '🎮',
  'Clothing': '👕',
  'Electronics': '📱',
  'Home Decor': '🏡',
};

const categoryColors = [
  'var(--accent-blue)', 'var(--brand-green-glow)', 'var(--accent-red)', 'var(--accent-yellow)',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#eab308'
];

interface CategoryFormProps {
  category: Category | null;
  parentCategories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ category, parentCategories, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    icon: category?.icon || '📁',
    color: category?.color || 'var(--accent-blue)',
    parent_id: category?.parent_id || ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data: any = {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
      };

      if (formData.parent_id) {
        data.parent_id = parseInt(String(formData.parent_id), 10);
      }

      if (category?.id) {
        await categoriesApi.update(category.id, data);
      } else {
        await categoriesApi.create(data);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to save category'));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
        {category?.id ? 'Edit Category' : formData.parent_id ? 'Add Subcategory' : 'Add Category'}
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: 'var(--re-ink)',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: 'var(--brand-green-glow)',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Category {category?.id ? 'updated' : 'created'} successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={fieldLabelStyle}>
          Category Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Food & Dining"
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      {!category?.parent_id && (
        <div style={{ marginBottom: '20px' }}>
          <label style={fieldLabelStyle}>
            Parent Category (optional)
          </label>
          <select
            name="parent_id"
            value={formData.parent_id}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--input-bg)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="" style={secondaryBgStyle}>None - This is a main category</option>
            {parentCategories.map(cat => (
              <option key={cat.id} value={cat.id} style={secondaryBgStyle}>
                {categoryIcon(cat.icon)} {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={fieldLabelStyle}>
          Icon
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {/* *** AN EMOJI IS NOT AN ACCESSIBLE NAME. *** axe reported the whole
              grid as `button-name`: a screen reader announced every swatch as
              "button". The label uses the icon's NAME rather than the glyph,
              because "Use the Groceries icon" is a thing somebody can act on and
              a read-aloud emoji is not. `aria-pressed` carries the selected
              state, which until now the coloured border said only visually. */}
          {Object.entries(categoryIcons).slice(0, 12).map(([name, icon]) => (
            <button
              key={icon}
              type="button"
              aria-label={`Use the ${name} icon`}
              aria-pressed={formData.icon === icon}
              onClick={() => setFormData(prev => ({ ...prev, icon }))}
              style={{
                width: '48px',
                height: '48px',
                background: formData.icon === icon ? 'rgba(34, 197, 94, 0.2)' : 'var(--input-bg)',
                border: formData.icon === icon ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={name}
            >
              {icon}
            </button>
          ))}
        </div>
        <input
          type="text"
          name="icon"
          value={formData.icon}
          onChange={handleChange}
          placeholder="Or enter custom emoji"
          maxLength={2}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={fieldLabelStyle}>
          Color
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {categoryColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, color }))}
              style={{
                width: '40px',
                height: '40px',
                background: color,
                border: formData.color === color ? '3px solid white' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            />
          ))}
        </div>
        <input
          type="color"
          name="color"
          value={formData.color}
          onChange={handleChange}
          style={{
            width: '100%',
            height: '48px',
            background: 'var(--input-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            /* White, not `--text-primary`: a filled green button's label sits on
               the brand green in BOTH themes while `--text-primary` flips with the
               page, so one theme always loses -- 2.83:1 light, 4.32:1 dark, against
               4.5. White is 5.02:1 on the gradient's first stop. D-103. */
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {category?.id ? 'Update Category' : 'Create Category'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const bodyTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' };
const bigStatStyle: React.CSSProperties = { fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };

export const CategoryManagement: React.FC = () => {
  // *** THE ONLY THING THIS PAGE DECIDES IS ITS OWN NAME. *** The
  // server owns which acts a `categories` mutation can move; a client-side
  // map would be a second list to keep in step with `acts.py`. The hook
  // fires on mount too, so a mutation handler nobody remembered to wire
  // still gets its moment on the next paint (D-106's shape).
  useSurfaceCoins('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<number | null>(null);

  /**
   * *** WHAT LAST MONTH'S SPENDING ACTUALLY SPLIT INTO. ***
   * The page has always been able to say how categories are CLASSIFIED and
   * never what that classification is worth, so the three-way control had no
   * payoff on screen: a user could sort 128 categories and see no figure
   * change anywhere. This is that figure — and it is the last COMPLETE month,
   * because on the 3rd rent has landed and the month's groceries have not, so
   * "fixed" would read as almost all of spending and tell the reader nothing
   * is theirs to move.
   *
   * Loaded in its own effect, not folded into `loadCategories`: it is a
   * different endpoint with a different failure mode, and a spend request that
   * 500s must not take the category list down with it. The split simply does
   * not render.
   */
  const [split, setSplit] = useState<(SpendSplit & { label: string }) | null>(null);
  /**
   * What each category actually cost, last full month.
   *
   * *** THE PAGE ALREADY FETCHED THIS AND THREW IT AWAY. *** The same request
   * fed only the Fixed/Flexible totals in the head, so the header talked about
   * money and the list below it showed none — which is exactly why the page
   * read as promising something it did not deliver (owner, 2026-09-19: "the
   * header makes it loook like its for seeing where money goes where as the
   * categories page just has categories").
   *
   * Keyed by NAME because that is how the server buckets it: two housemates'
   * "Groceries" are one slice of one household's spending. The ids ride along
   * so a row can ask the follow-up question.
   */
  const [spendByName, setSpendByName] =
    useState<Map<string, { amount: number; ids: number[] }>>(new Map());
  /** Which category's payee breakdown is open. */
  const [openCategory, setOpenCategory] = useState<{ name: string; ids: number[] } | null>(null);
  const [showUnused, setShowUnused] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (!categories.length) return;
    let cancelled = false;
    (async () => {
      const month = lastFullMonth();
      try {
        // 200, not 5: this is a total, and a "top 5" would silently make every
        // figure on the row too small. The endpoint's default is 5.
        const rows = await analyticsService.getTopSpendingCategories(
          200, month.start, month.end, 'expense');
        if (cancelled) return;
        const byName = spendingTypeByName(categories.map((c) => ({
          id: c.id, name: c.name, parent_id: c.parent_id ?? null,
          spending_type: (c.spending_type ?? null) as never,
        })));
        setSplit({ ...splitSpendByGroup(rows, byName), label: month.label });
        setSpendByName(new Map(rows.map((r: { name?: string | null; amount?: number | null; ids?: number[] }) => [
          (r.name || '').trim() || 'Uncategorised',
          { amount: Number(r.amount) || 0, ids: Array.isArray(r.ids) ? r.ids : [] },
        ])));
      } catch {
        // Silent on purpose: the split is an extra, and an error banner over a
        // working category list would be the page shouting about the wrong
        // thing. `uiHonesty` forbids showing a zero here instead.
        if (!cancelled) { setSplit(null); setSpendByName(new Map()); }
      }
    })();
    return () => { cancelled = true; };
  }, [categories]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await categoriesApi.getAll();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) return;

    try {
      await categoriesApi.delete(id);
      await loadCategories();
    } catch (error: any) {
      alert(apiErrorMessage(error, 'Failed to delete category. It may have associated transactions.'));
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setAddingSubcategoryTo(null);
    setShowAddPanel(true);
  };

  const handleAddSubcategory = (parentId: number) => {
    setAddingSubcategoryTo(parentId);
    setEditingCategory({
      id: 0,
      name: '',
      icon: '📁',
      color: 'var(--accent-blue)',
      parent_id: parentId,
      is_system: false
    });
    setShowAddPanel(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setAddingSubcategoryTo(null);
    setShowAddPanel(true);
  };

  const handleClosePanel = () => {
    setShowAddPanel(false);
    setEditingCategory(null);
    setAddingSubcategoryTo(null);
  };

  const handleSuccess = () => {
    handleClosePanel();
    loadCategories();
  };

  // Filter categories
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Separate parent and subcategories
  const parentCategories = filteredCategories.filter((cat) => !cat.parent_id);
  const getSubcategories = (parentId: number) =>
    filteredCategories.filter((cat) => cat.parent_id === parentId);

  /**
   * What a card cost: the category's own spending PLUS its children's.
   *
   * *** A PARENT WOULD OTHERWISE READ ZERO WITH ITS MONEY INSIDE IT. *** The
   * server buckets each expense under its OWN category, so Food is 0 while
   * Coffee, drawn inside Food's card, is 40 — a card that says nothing while
   * displaying the thing it is nothing about. One level, matching every other
   * rollup in this product.
   */
  const spendFor = (category: Category) => {
    const own = spendByName.get((category.name || '').trim());
    const kids = categories
      .filter((c) => c.parent_id === category.id)
      .map((c) => spendByName.get((c.name || '').trim()))
      .filter(Boolean) as Array<{ amount: number; ids: number[] }>;
    const rows = own ? [own, ...kids] : kids;
    return {
      amount: rows.reduce((sum, r) => sum + r.amount, 0),
      ids: rows.flatMap((r) => r.ids),
    };
  };

  /* Biggest first — the question the page now answers is "where did it go",
     and alphabetical answers a different one. */
  const spenders = parentCategories
    .map((cat) => ({ cat, spend: spendFor(cat) }))
    .filter((r) => r.spend.amount > 0)
    .sort((a, b) => b.spend.amount - a.spend.amount);
  /* *** KEPT, NOT HIDDEN. *** Pruning a category nobody uses is this page's
     other job, and it is the only place you can do it. Folded so the answer
     to "where did it go" is not buried under a list of noughts. */
  const unused = parentCategories.filter((cat) => spendFor(cat).amount <= 0);
  const spendTotal = spenders.reduce((sum, r) => sum + r.spend.amount, 0);
  /**
   * *** WITH NOTHING SPENT, EVERY CATEGORY IS "UNUSED" AND THE PAGE FOLDS
   * ITSELF AWAY. *** A new instance, or one whose spend request failed, would
   * show an empty list behind "Show 12 unused" — hiding the only controls the
   * page has on the very account that has nothing else to look at. Two
   * existing tests went red on exactly this, which is them doing their job:
   * the fold separates spenders from the rest, and with no spenders there is
   * nothing to separate.
   */
  const nothingSpent = spenders.length === 0;

  /**
   * Suggested categories the user has not created yet — #125.
   *
   * Derived from `categories`, NOT from `filteredCategories`: the latter is narrowed by the
   * search box, so typing in it would make already-created categories look uncreated and
   * the panel would start re-suggesting them. Matched on a trimmed, lowercased name
   * because the user types the name themselves and "groceries" is the same category as
   * "Groceries".
   */
  const existingNames = new Set(
    categories.map((cat) => (cat.name || '').trim().toLowerCase()),
  );
  const unusedSuggestions = Object.entries(categoryIcons).filter(
    ([name]) => !existingNames.has(name.trim().toLowerCase()),
  );

  const [suggestionsDismissed, setSuggestionsDismissed] = useState<boolean>(
    () => localStorage.getItem(SUGGESTIONS_DISMISSED_KEY) === 'true',
  );

  const dismissSuggestions = () => {
    localStorage.setItem(SUGGESTIONS_DISMISSED_KEY, 'true');
    setSuggestionsDismissed(true);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTop: '3px solid #22c55e',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto'
        }} />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading categories...</p>
      </div>
    );
  }

  return (
    /* *** THE SHARED PAGE SHELL, ON ONE ELEMENT. *** `pageContainerStyle` is the
       24px gutter and `pageMaxWidthStyle` the 1400px cap. Measured on the
       deployed demo at 1440px: this page's content began at 240px, flush against
       the side nav, while every page using the shell began at 264px.
       Combined on one div rather than nested, because the two differ only in
       whether the gutter sits inside or outside the cap and a 240px side nav
       means the cap cannot bind below a 1640px viewport.
       *** THIS FILE ALREADY IMPORTED `pageContainerStyle` AND NEVER USED IT. ***
       A shared barrel import makes a page look like it adopted the shell. */
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      <PageHead
        band="categories"
        title="Categories"
        /* *** THE HEAD PROMISED WHERE THE MONEY WENT AND THE LIST DID NOT
           DELIVER IT. *** Owner, 2026-09-19: "the header makes it loook like
           its for seeing where money goes where as the categories page just
           has categories". It delivers it now, so the sentence can say so —
           and it keeps the second half, because sorting a category is what
           the Budgets page depends on and this is the only place to do it. */
        subtitle={split
          ? `Where your money went in ${split.label.split(' ')[0]} — your last full month. Sorting a category into Fixed or Flexible is what makes the Budgets page honest.`
          : 'Where your money goes, and the sorting that makes the Budgets page honest.'}
        right={<button
          onClick={handleAddCategory}
          style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            /* *** WHITE, NOT `--text-primary`. *** A filled green button's label
               sits on the brand green in BOTH themes while `--text-primary`
               flips with the page, so one of the two always loses: measured
               2.83:1 in light (#17301f on #15803d) and 4.32:1 in dark (#e9f0e6),
               against a 4.5 requirement. White measures 5.02:1 on the gradient's
               first stop.

               *** THIS EXACT FIX ALREADY EXISTED IN `Investments.tsx`, WITH THE
               SAME RATIOS WRITTEN OUT, AND THIS BUTTON DID NOT HAVE IT. *** A
               convention recorded in one file and in CONTRIBUTING.md ("do NOT use
               `var(--text-primary)` on coloured buttons") is not adoption --
               which is D-106's shape, one layer over. The contrast walk is what
               found the second site. D-103. */
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s'
          }}
        >
          <Plus size={20} />
          Add Category
        </button>}
      />

      {/* *** THE PAYOFF FOR SORTING THEM, WHICH THIS PAGE NEVER SHOWED. ***
          Three figures, from the last full month, in the same three groups the
          per-row control sets. Fixed first because it is the one the reader
          cannot change; flexible second because it is the answer to "what is
          actually mine to move".

          Every number here is joined from two payloads by category NAME,
          because `/analytics/categories/top` carries no id. Names can collide —
          the demo has six duplicates, one resolving to two different types — so
          `splitSpendByGroup` refuses an ambiguous name rather than guessing,
          and anything it could not attribute is named below rather than
          quietly missing from a total. */}
      {/* *** RENDERED THROUGH `TotalsRow`, NOT A FOURTH HAND-ROLLED GRID. ***
          I wrote this as its own `display: grid` with hairline borders first,
          which is `TotalsRow` re-implemented — and `sidebarAndStatCardsMeasured`
          failed it, correctly: the gate's whole subject is that a page's stat
          row goes through the one shared shell, because this file and Rules
          once drifted 19px apart doing exactly this. The component was written
          for the dashboard and its own header says it is meant to be reused
          for "the same shape of header and four of its own figures".

          Every number here is joined from two payloads by category NAME,
          because `/analytics/categories/top` carries no id. Names can collide —
          the demo has six duplicates, one resolving to two different types — so
          `splitSpendByGroup` refuses an ambiguous name rather than guessing,
          and anything it could not attribute is named below rather than
          quietly missing from a total. */}
      {split && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '24px',
        }}>
          <TotalsRow
            cells={[
              {
                label: 'Fixed',
                value: formatMoney(split.fixed),
                note: split.fixed === 0
                  ? `nothing landed in ${split.label.split(' ')[0]}`
                  : 'arrives whatever you do',
              },
              {
                label: 'Flexible',
                value: formatMoney(split.flexible),
                valueColor: 'var(--g-ink)',
                note: split.flexible === 0
                  ? `nothing landed in ${split.label.split(' ')[0]}`
                  : 'yours to move',
              },
              {
                label: 'Non-monthly',
                // *** `--au-ink`, NOT `--kt-seg-4`. *** The segment tokens are
                // FILLS. `--kt-seg-4` is #B8884D, which measures 3.06:1 on the
                // card in light — the contrast walk failed this exact pair, and
                // `coins/_kit.css` carries the same warning with the same
                // number: it "survives as --seg-4, which is a FILL and never
                // carries a label".
                value: formatMoney(split.non_monthly),
                valueColor: 'var(--au-ink)',
                note: split.non_monthly === 0
                  ? `nothing landed in ${split.label.split(' ')[0]}`
                  : 'lands some months and not others',
              },
              // Only when there is some: a zero here would invite sorting work
              // that is already done, and "Not sorted yet — $0.00" reads as a
              // problem rather than as finished.
              ...(split.unsorted > 0 ? [{
                label: 'Not sorted yet',
                value: formatMoney(split.unsorted),
                valueColor: 'var(--text-secondary)',
                // NOT folded into flexible. Unsorted means finPal does not
                // know; calling it movable would claim the user said so.
                note: 'finPal cannot say which of the three this is',
              }] : []),
            ]}
          />
        </div>
      )}
      {split && split.unattributable.length > 0 && (
        <p className="fp-hint" style={{ marginTop: '-12px', marginBottom: '24px' }}>
          Left out of the figures above, because more than one category shares
          the name and they are sorted differently:{' '}
          {split.unattributable.join(', ')}.
        </p>
      )}

      {/* *** THE THREE COUNT CARDS ARE GONE, AND THE SPLIT ABOVE IS WHY. ***
          They said Main Categories 19, Subcategories 128, Total Items 147 —
          inventory, not insight. With the fixed/flexible figures now sitting
          directly above them the page carried TWO stacked three-column rows
          saying different kinds of thing, which is the 'everything looks out
          of place' shape the dashboard was just rewritten to remove, and the
          mockup has only the money row.

          The one count that prompts an action survives in the line below,
          without a denominator: '19 categories have no spending group yet'.
          '19 of 147' would be the '16 of 19 lessons' shape the spec took off
          the dashboard — a total finPal chose rather than one the user did.

          The `StatCard` import goes with them: this was its only use here, and
          an import with no JSX behind it is the same false claim a comment can
          make. (I wrote "still used by this file's other row" first, checked,
          and there is no other row — D-221 was exactly a comment describing a
          world that had moved on.) `sidebarAndStatCardsMeasured` is about not
          hand-rolling a stat shell, not about how many pages use the shared
          one, so dropping a usage is not a regression — and the split above
          renders no `bigStatStyle`, which is the thing that gate looks for. */}

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={20} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              background: 'var(--input-bg)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={20} color="#64748b" />
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      {/* *** THE PAYOFF LINE — the mockup's one addition to this page. *** It
          lists categories and never says why sorting them matters, so the
          three-way control reads as admin. What it earns the user is stated
          here, in their own numbers.

          *** A COUNT OF WHAT IS LEFT, NEVER A FRACTION. *** "128 of 147" is a
          denominator finPal chose; "36 have no spending group yet" is a fact
          about their data and it goes down as they work. Decision 5 allows one
          denominator — a target the user set — and this is not one.

          *** AND NO COIN FIGURE, DELIBERATELY. *** The mockup prints
          "+300 coins" for finishing, but `/coins` returns coins ALREADY EARNED
          scaled by coverage, not a price for completion. Promising 300 would be
          inventing a figure on the screen whose whole job is to be trustworthy.
          Review shows the earned badge per section, which is the honest half of
          the same idea. */}
      {(() => {
        // `categories` is already FLAT — parents and children together, with
        // the tree derived from `parent_id` (the stat row above counts
        // children the same way). My first version recursed into a
        // `subcategories` field this type does not declare, and the typecheck
        // said so.
        const unsorted = categories.filter((c) => !c.spending_type).length;
        if (unsorted === 0) return null;
        return (
          <div style={{
            marginBottom: '16px', padding: '14px 18px',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6,
          }}>
            <strong>{unsorted.toLocaleString()}</strong>{' '}
            {unsorted === 1 ? 'category has' : 'categories have'} no spending group yet.
            Sorting {unsorted === 1 ? 'it' : 'them'} is what lets finPal tell you what is
            actually yours to move each month, instead of guessing at it.
          </div>
        );
      })()}

      <div style={flexColGap16}>
        {parentCategories.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            background: 'var(--bg-card)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <Folder size={64} color="#64748b" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '20px' }}>No categories found</p>
            <button
              onClick={handleAddCategory}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                border: 'none',
                borderRadius: '8px',
                /* White, not `--text-primary` — see the Add Category button above. D-103. */
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={20} />
              Create Your First Category
            </button>
          </div>
        ) : (
          (nothingSpent || showUnused
            ? [...spenders.map((r) => r.cat), ...unused]
            : spenders.map((r) => r.cat))
            .map((category) => {
            const subcategories = getSubcategories(category.id);
            const spend = spendFor(category);
            const share = spendTotal > 0 ? (spend.amount / spendTotal) * 100 : 0;

            return (
              <div
                key={category.id}
                style={{
                  padding: '24px',
                  background: 'var(--bg-card)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  transition: 'all 0.3s'
                }}
              >
                {/* Parent Category */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: subcategories.length > 0 ? '20px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: '40px',
                      flexShrink: 0,
                      width: '60px',
                      height: '60px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `color-mix(in srgb, ${category.color} 12.5%, transparent)`,
                      borderRadius: '12px'
                    }}>
                      {categoryIcon(category.icon)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {/* h2, not h3. This sits directly under the page's single h1 with no
                          section heading between, so an h3 here jumps a level and breaks
                          the outline a screen reader navigates by. Found by widening
                          `every-page.spec.ts`'s heading check from the six pages
                          `standards.spec.ts` listed to all 21 derived routes — four pages
                          were doing this and nothing said so. The size is inline, so the
                          tag change is invisible on screen. */}
                      <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px', overflowWrap: 'anywhere' }}>
                        {category.name}
                      </h2>
                      {/* *** WHAT IT COST, WHICH IS WHAT THE HEAD HAS ALWAYS
                          PROMISED. *** The page fetched this and used it only
                          for the split above; the list showed no money at all.
                          The share is of the spend this page is ABOUT, not of
                          anyone's income — a percentage of a figure the reader
                          can see beside it. */}
                      {spend.amount > 0 ? (
                        <p style={bodyTextStyle}>
                          <strong style={{ color: 'var(--text-primary)' }}>
                            {formatMoney(spend.amount)}
                          </strong>
                          {` · ${share.toFixed(0)}% of the month`}
                          {subcategories.length > 0
                            && ` · ${subcategories.length} subcategor${subcategories.length === 1 ? 'y' : 'ies'}`}
                        </p>
                      ) : (
                        <p style={bodyTextStyle}>
                          {split
                            ? `Nothing spent in ${split.label.split(' ')[0]}`
                            : `${subcategories.length} subcategor${subcategories.length === 1 ? 'y' : 'ies'}`}
                        </p>
                      )}
                      {spend.amount > 0 && spend.ids.length > 0 && (
                        <button
                          type="button"
                          data-testid={`where-${category.id}`}
                          onClick={() => setOpenCategory((cur) => (
                            cur?.name === category.name
                              ? null
                              : { name: category.name, ids: spend.ids }))}
                          aria-expanded={openCategory?.name === category.name}
                          style={{
                            marginTop: 4, padding: 0, border: 0, background: 'none',
                            color: 'var(--g-ink)', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {openCategory?.name === category.name
                            ? 'Hide where it went'
                            : 'Where it went →'}
                        </button>
                      )}
                      {/* *** SPEC §1 DECISION 3: BOTH SCREENS, ONE VALUE. ***
                          The budget page lists only categories that HAVE a
                          budget, and its Unsorted section only ones money left
                          through this month -- so a category with neither had
                          nowhere to be reclassified, and §4's promise that a
                          default is always correctable was not true of it. */}
                      <div style={{ marginTop: '6px' }}>
                        <SpendingTypeControl
                          categoryId={category.id}
                          value={category.spending_type ?? null}
                          onChanged={loadCategories}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={flexRowGap8}>
                    {/* Named per row, never a bare "Edit": a list of identical
                        "Edit" buttons tells a screen-reader user nothing about
                        which category they are on. */}
                    <button
                      aria-label={`Edit ${category.name}`}
                      onClick={() => handleEdit(category)}
                      style={{
                        padding: '10px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                        color: 'var(--bl-ink)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s'
                      }}
                      title="Edit category"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      aria-label={`Delete ${category.name}`}
                      onClick={() => handleDelete(category.id)}
                      style={{
                        padding: '10px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: 'var(--re-ink)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.3s'
                      }}
                      title="Delete category"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* *** THE FOLLOW-UP QUESTION, IN THE SAME PANEL THE FLOW
                    DIAGRAM USES. *** One component answers "who was paid
                    inside this slice" wherever the slice is clicked, so the
                    two surfaces cannot drift into two answers — and it is
                    asked with the ids this card actually summed, parent and
                    children, so its rows add up to the figure above them. */}
                {openCategory?.name === category.name && (
                  <SliceBreakdown
                    node={{
                      id: `cat-${category.id}`, label: category.name,
                      value: spend.amount, side: 'out', categoryIds: spend.ids,
                    }}
                    start={lastFullMonth().start}
                    end={lastFullMonth().end}
                    format={(amount) => formatMoney(amount)}
                    onClose={() => setOpenCategory(null)}
                  />
                )}

                {/* Subcategories */}
                {subcategories.length > 0 && (
                  <div style={{
                    paddingLeft: '76px',
                    borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                    marginBottom: '16px'
                  }}>
                    {subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--surface-hover)',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          transition: 'all 0.3s'
                        }}
                      >
                        {/* *** THE GROUP CONTROL OVERFLOWED THIS ROW AT 390px AND THE
                            RESPONSIVE WALK CAUGHT IT: 466 against a 390 viewport. ***
                            Measured A/B -- the same page WITHOUT the control is 390/390,
                            so this is mine and not pre-existing. The squeeze is real
                            estate: this list is indented 76px, so a long name, a 40px
                            icon, a `<select>` and two icon buttons compete for 314px.
                            Overridden locally rather than by editing the shared
                            `flexRowGap12`, which a dozen other components use and none
                            of them asked for this. */}
                        <div style={{ ...flexRowGap12, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: '24px',
                            flexShrink: 0,
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `color-mix(in srgb, ${sub.color} 12.5%, transparent)`,
                            borderRadius: '8px'
                          }}>
                            {categoryIcon(sub.icon)}
                          </div>
                          <span style={{ color: 'var(--text-primary)', fontSize: '15px', minWidth: 0, overflowWrap: 'anywhere' }}>{sub.name}</span>
                          {/* A subcategory inherits its parent's group until it
                              is given one, so this is where that override is
                              made -- and a subcategory is the level at which
                              the split actually does its work (Groceries vs
                              Restaurants under Food). */}
                          <SpendingTypeControl
                            categoryId={sub.id}
                            value={sub.spending_type ?? null}
                            inherited={sub.spending_type == null
                              && category.spending_type != null}
                            onChanged={loadCategories}
                          />
                        </div>
                        <div style={flexRowGap8}>
                          <button
                            aria-label={`Edit ${sub.name}`}
                            onClick={() => handleEdit(sub)}
                            style={{
                              padding: '8px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '6px',
                              color: 'var(--bl-ink)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'all 0.3s'
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            aria-label={`Delete ${sub.name}`}
                            onClick={() => handleDelete(sub.id)}
                            style={{
                              padding: '8px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: '6px',
                              color: 'var(--re-ink)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'all 0.3s'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Subcategory Button */}
                <div style={{ paddingLeft: '76px' }}>
                  <button
                    aria-label={`Add a subcategory to ${category.name}`}
                    onClick={() => handleAddSubcategory(category.id)}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--surface-hover)',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s'
                    }}
                  >
                    <Plus size={16} />
                    Add Subcategory
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* *** PRUNING IS THIS PAGE'S OTHER JOB AND THE ONLY PLACE TO DO IT.
            *** A category nobody spent in is not an answer to "where did it
            go", but it IS the thing you came here to delete — so it folds
            rather than disappearing, and the count is on the control so the
            page never silently omits part of the list. */}
        {unused.length > 0 && !nothingSpent && (
          <button
            type="button"
            data-testid="unused-categories"
            onClick={() => setShowUnused((v) => !v)}
            aria-expanded={showUnused}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: '1px dashed var(--border-medium)',
              borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 14, textAlign: 'left',
            }}
          >
            {showUnused ? 'Hide' : 'Show'} {unused.length} unused
            {split ? ` in ${split.label.split(' ')[0]}` : ''}
          </button>
        )}
      </div>

      {/* Suggested Categories

          #125: this was `parentCategories.length === 0`, so creating a single category
          removed the whole panel — the reporter's words were "every categories suggestion
          disappear when creating your first, imho they should remain. Or can be disabled
          with a flag." Both, then: the ones already created drop out of the list (offering
          "Groceries" to somebody who just made Groceries is the only thing the old gate
          got right), the panel goes when nothing is left to suggest, and there is an
          explicit dismiss for someone who would rather organise their own way.

          The dismissal is localStorage rather than a user column: it is a per-person UI
          preference with no meaning to the API, and `create_all()` would not add the
          column to an existing install anyway (D-121). */}
      {!suggestionsDismissed && unusedSuggestions.length > 0 && (
        <div style={{
          marginTop: '24px',
          padding: '24px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h2 className="fp-section-title" style={{ marginBottom: 0 }}>
              Suggested Categories
            </h2>
            <button
              type="button"
              onClick={dismissSuggestions}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '4px 8px',
              }}
              title="Stop showing suggested categories"
            >
              Hide these
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
            {unusedSuggestions.map(([name, icon]) => (
              <div
                key={name}
                onClick={() => {
                  setEditingCategory({
                    id: 0,
                    name: name,
                    icon: icon,
                    color: categoryColors[Math.floor(Math.random() * categoryColors.length)],
                    is_system: false
                  });
                  setShowAddPanel(true);
                }}
                style={{
                  padding: '16px',
                  background: 'var(--input-bg)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
                <p style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '500' }}>{name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddPanel}
        onClose={handleClosePanel}
        title={editingCategory?.id ? 'Edit Category' : 'Add Category'}
        maxWidth="600px"
      >
        <CategoryForm
          category={editingCategory}
          parentCategories={parentCategories}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </Modal>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
