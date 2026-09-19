import React, { useEffect, useState } from 'react';
import { spendingSummaryApi, type SpendingGroup } from '../../services/api/spendingSummary';
import type { FlowNode } from '../../utils/incomeFlow';

/**
 * What a slice of the flow diagram was actually spent on.
 *
 * *** IT SAYS "WHERE IT WENT", NEVER "MERCHANT". *** The server groups on the
 * DESCRIPTION column and its own docstring says callers must not be told
 * otherwise -- there is no merchant field on an expense. On real data that is
 * usually a shop ("Costco", "Whole Foods Market") but it is just as often not
 * a company at all ("Rent Payment", "Car Insurance"), and a bank import gives
 * you `TESCO STORES 3428` and `TESCO EXPRESS` as two separate rows. A heading
 * claiming these are companies would be a caption that does not describe the
 * rows beneath it.
 *
 * *** THE TOTAL IS THE SERVER'S, AND IT EQUALS THE SLICE. *** It is asked with
 * the exact set of category ids the node says it merged, and split rows are
 * attributed by their splits (D-272) -- so the rows add up to the band that
 * was clicked. Anything computed here instead would be a second arithmetic to
 * disagree with the first.
 */
export const SliceBreakdown: React.FC<{
  node: FlowNode;
  start: string;
  end: string;
  format: (amount: number) => string;
  onClose: () => void;
}> = ({ node, start, end, format, onClose }) => {
  const [rows, setRows] = useState<SpendingGroup[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    spendingSummaryApi
      .get({
        start_date: start,
        end_date: end,
        group_by: 'merchant',
        /* `[]` is the Uncategorised slice, and the server asks for it as `0`.
           Sending nothing would silently return the WHOLE range instead of
           the one slice -- the loudest possible wrong answer. */
        category_id: (node.categoryIds?.length ? node.categoryIds : [0]).join(','),
      })
      .then((data) => { if (live) { setRows(data.groups); setTotal(data.total); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [node.id, node.categoryIds, start, end]);

  return (
    <section
      data-testid="slice-breakdown"
      aria-label={`What ${node.label} was spent on`}
      style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '1px solid var(--border-light)',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', gap: 12, marginBottom: 10,
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Where it went · {node.label}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 0, padding: 0, cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13,
          }}
        >
          Close
        </button>
      </div>

      {failed && (
        <p className="fp-hint" style={{ margin: 0 }}>
          Could not load this breakdown.
        </p>
      )}

      {!failed && rows === null && (
        <p className="fp-hint" style={{ margin: 0 }}>Loading…</p>
      )}

      {/* *** AN EMPTY SLICE IS A REAL ANSWER, NOT A BLANK. *** A bundle can be
          made entirely of rows outside this window once the range moves. */}
      {!failed && rows !== null && rows.length === 0 && (
        <p className="fp-hint" style={{ margin: 0 }}>
          Nothing to break down in this period.
        </p>
      )}

      {!failed && rows !== null && rows.length > 0 && (
        <>
          {rows.map((row) => (
            <div
              key={String(row.key)}
              data-testid={`slice-row-${row.key}`}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 16,
                padding: '8px 0', borderTop: '1px solid var(--border-light)',
                fontSize: 14,
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.label}
              </span>
              <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {format(row.total)}
              </span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            padding: '9px 0 0', marginTop: 4,
            borderTop: '1px solid var(--border-medium)',
            fontSize: 14, fontWeight: 600,
          }}>
            <span>{rows.length} {rows.length === 1 ? 'payment' : 'payees'}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format(total)}</span>
          </div>
        </>
      )}
    </section>
  );
};
