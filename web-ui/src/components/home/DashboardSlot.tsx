/**
 * The one slot at the top of the Dashboard. Several cards want it (hard month, recall, this week);
 * only the first that has something to say is shown, and nothing is shown while an earlier one is
 * still finding out, so a card never appears and then gets pushed out by a slower one above it.
 */
import React from 'react';

export type SlotState = 'loading' | 'show' | 'hide';

export interface SlotEntry {
  key: string;
  state: SlotState;
  render: () => React.ReactNode;
}

export const DashboardSlot: React.FC<{ entries: SlotEntry[] }> = ({ entries }) => {
  for (const entry of entries) {
    if (entry.state === 'loading') return null;
    if (entry.state === 'show') return <React.Fragment key={entry.key}>{entry.render()}</React.Fragment>;
  }
  return null;
};

export default DashboardSlot;
