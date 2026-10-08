import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useGuideStore } from '../../store/guideStore';
import type { GuidePage } from '../../services/onboardingService';

/**
 * A small help button in the page header (Nova, in the hosted edition): the way back to the card once it is dismissed.
 *
 * In the header's action slot and NOT the bottom-right corner, which already holds
 * the coin-award card. Absent until the card has been dismissed: before that the
 * card itself is the entry point and a second control would say the same thing twice.
 * Decorative image, real accessible name on the button.
 */
export const GuideButton: React.FC<{ page: GuidePage }> = ({ page }) => {
  const { status, pages, dismissed, reopen } = useGuideStore();
  if (status !== 'ready' || !pages[page] || !dismissed.includes(page)) return null;
  return (
    <button type="button" id={`guide-button-${page}`} className="fp-guide-btn" aria-label="About this page"
            onClick={() => reopen(page)}>
      <HelpCircle size={20} aria-hidden="true" style={{ color: 'var(--brand-main-green)' }} />
    </button>
  );
};

export default GuideButton;
