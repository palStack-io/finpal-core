/**
 * "Your skills": six rows, each a skill and three dots (understood, used on your money, remembered).
 * Sits beside the month chart on wide screens and below it on narrow ones (the Dashboard owns the grid).
 *
 * Rows are plain text in core, not links: a row would open a lesson only if a short lesson exists for
 * that skill and is relevant now, and core does not decide that. Hidden when learning is off or the
 * fetch fails.
 */
import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../components/SectionCard';
import { learnpalService } from './service';
import { SkillDots } from './ShortLessonPanel';
import type { SkillProgress } from '../../types/learnpal';

export interface SkillsProgressState {
  /** True while the fetch is out: the Dashboard reserves the column so Cash Flow does not jump. */
  loading: boolean;
  /** `null` when off, empty or failed: no column. */
  skills: SkillProgress[] | null;
}

export function useSkillsProgress(): SkillsProgressState {
  const [state, setState] = useState<SkillsProgressState>({ loading: true, skills: null });
  useEffect(() => {
    let live = true;
    learnpalService.getSkillsProgress()
      .then((r) => { if (live) setState({ loading: false, skills: r.enabled && r.skills.length > 0 ? r.skills : null }); })
      .catch(() => { if (live) setState({ loading: false, skills: null }); });
    return () => { live = false; };
  }, []);
  return state;
}

export const SkillsCard: React.FC<{ skills: SkillProgress[] }> = ({ skills }) => (
  <div data-testid="skills-card">
    <SectionCard title="Your skills">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {skills.map((s) => (
          <li key={s.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0',
            borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)', fontSize: 15,
          }}>
            <span>{s.title}</span>
            <SkillDots marks={s.marks} />
          </li>
        ))}
      </ul>
    </SectionCard>
  </div>
);

export default SkillsCard;
