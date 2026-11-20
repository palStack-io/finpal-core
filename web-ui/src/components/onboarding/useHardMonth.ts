/**
 * The hard-month lookup, lifted out of HardMonthCard so the Dashboard slot can ask it too.
 * Behaviour is unchanged: nothing until the server answers, nothing if the lookup fails, and a
 * failed dismiss leaves the card on screen so the click can be retried.
 */
import { useCallback, useEffect, useState } from 'react';
import { onboardingService, type HardMonthOpening } from '../../services/onboardingService';
import type { SlotState } from '../home/DashboardSlot';

export interface HardMonthState {
  opening: HardMonthOpening | null;
  closing: boolean;
  close: () => Promise<void>;
  state: SlotState;
}

export function useHardMonth(): HardMonthState {
  const [opening, setOpening] = useState<HardMonthOpening | null>(null);
  const [settled, setSettled] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onboardingService.getHardMonth('en')
      .then((o) => { if (!cancelled) setOpening(o); })
      .catch(() => { /* no card beats a wrong one */ })
      .finally(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, []);

  const close = useCallback(async () => {
    if (!opening) return;
    setClosing(true);
    try {
      await onboardingService.dismissHardMonth(opening.key);
      setOpening(null);
    } catch {
      // Left on screen so the click can be retried.
    } finally {
      setClosing(false);
    }
  }, [opening]);

  const state: SlotState = !settled ? 'loading' : opening ? 'show' : 'hide';
  return { opening, closing, close, state };
}
