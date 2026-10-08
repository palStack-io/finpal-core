import React from 'react';
import {
  Wallet, Target, Mountain, LayoutDashboard, ArrowLeftRight, TrendingUp, Repeat, Tag, Filter,
  ListChecks, Briefcase, PieChart, Users, Settings, CreditCard, GraduationCap,
} from 'lucide-react';
import type { GuidePage } from '../../services/onboardingService';

/**
 * The picture on a page guide's card. The hosted edition draws Nova here; core has no
 * mascot, so each page gets its own icon in a disc. Decorative: the card says everything
 * in text, so the icon is hidden from assistive technology.
 */
const ICON: Record<GuidePage, React.ComponentType<{ size?: number }>> = {
  accounts: Wallet, budgets: Target, goals: Mountain, dashboard: LayoutDashboard,
  transactions: ArrowLeftRight, investments: TrendingUp, recurring: Repeat, categories: Tag,
  rules: Filter, review: ListChecks, kit: Briefcase, analytics: PieChart, groups: Users,
  settings: Settings,
  pointspal: CreditCard, 'pointspal-caps': CreditCard, 'pointspal-recommend': CreditCard,
  'pointspal-cards': CreditCard, 'pointspal-redeem': CreditCard,
  learnpal: GraduationCap, 'learnpal-lessons': GraduationCap, 'learnpal-range': Mountain,
};

export const GuideArt: React.FC<{ page: GuidePage; size?: number }> = ({ page, size = 72 }) => {
  const Icon = ICON[page] ?? Mountain;
  return (
    <span
      aria-hidden="true"
      data-guide-art={page}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: `${size}px`, height: `${size}px`, borderRadius: '1rem',
        background: 'var(--surface-hover)', color: 'var(--brand-main-green)',
        border: '1px solid var(--border-light)',
      }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
};

export default GuideArt;
