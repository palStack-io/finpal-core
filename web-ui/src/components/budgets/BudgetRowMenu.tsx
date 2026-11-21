/**
 * Budgets C (core): the ⋯ on every budget row. It holds what used to sit in the row itself: the spending-group select,
 * the transactions list, edit and delete. The controls are the same components as before (`SpendingTypeControl`);
 * only where they sit changed.
 *
 * A disclosure, not `role="menu"`: it holds a form control, and a menu's arrow-key model would fight the select.
 * Escape, a click outside, or focus moving out of it close it; Escape hands focus back to the ⋯ button. Edit and
 * Delete pass that button to the page, which returns focus to it when the panel or the dialog closes.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { List, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

export interface BudgetRowMenuProps {
  budgetId: number;
  name: string;
  /** The spending-group select, already wired by the page. */
  controls: React.ReactNode;
  onEdit: (opener: HTMLButtonElement | null) => void;
  onDelete: (opener: HTMLButtonElement | null) => void;
  expanded: boolean;
  onToggleTransactions: () => void;
}

export const BudgetRowMenu: React.FC<BudgetRowMenuProps> = ({
  budgetId, name, controls, onEdit, onDelete, expanded, onToggleTransactions,
}) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const act = (fn: (opener: HTMLButtonElement | null) => void) => () => { setOpen(false); fn(button.current); };
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrap.current?.contains(next)) return;
    if (next) setOpen(false);
  };

  return (
    <div className="fp-bc-menu-wrap" ref={wrap} onBlur={onBlur}>
      <button ref={button} type="button" className="fp-bc-more fp-press" aria-label={`Options for ${name}`}
        aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="fp-bc-menu" role="group" aria-label={name} data-testid={`budget-menu-${budgetId}`}>
          <div className="fp-bc-menu-controls">{controls}</div>
          <button type="button" className="fp-bc-menu-item fp-press" onClick={act(() => onToggleTransactions())}>
            <List size={16} aria-hidden="true" />
            {expanded ? 'Hide transactions' : 'Show transactions'}
          </button>
          <button type="button" className="fp-bc-menu-item fp-press" onClick={act(onEdit)}>
            <Pencil size={16} aria-hidden="true" /> Edit budget
          </button>
          <button type="button" className="fp-bc-menu-item fp-bc-menu-danger fp-press" onClick={act(onDelete)}>
            <Trash2 size={16} aria-hidden="true" /> Delete budget
          </button>
        </div>
      )}
    </div>
  );
};

export default BudgetRowMenu;
