/**
 * "Your skills" as a trail (design move 2, mockup 2A, 2026-11-20): six waypoints on a gentle path, one card
 * per skill under it. Each card lists the three marks in words with a filled or outline mark: "Understood",
 * "Used on your money", "Still remembered". The marks are independent (they fill in any order), so the trail
 * implies no order between them, and the waypoint is filled when any mark is.
 *
 * The skill held in This week is highlighted. A card links to its short lesson ("Start, 1 min" before it is
 * understood, "Read why, 1 min" after) only when the server says that lesson applies to this person's
 * numbers now (`short` on GET skills-progress); otherwise there is nothing to open, so no link. The lesson
 * opens in place, and the mark it earns fills without a reload.
 *
 * Layout: horizontal when the card is 768px wide or more, vertical (waypoints down the left edge) when
 * narrower. A container query, not a viewport one, because the Dashboard puts this card in its one-third
 * aside column, where six columns would not fit at any window width (`.lp-trail` in finpal-theme.css).
 *
 * Same component on the Dashboard and the Learn page. Hidden when learning is off or the fetch fails.
 * Core edition: English only, no motion.
 */
import React, { useEffect, useState } from 'react';
import { SectionCard } from '../../components/SectionCard';
import { learnpalService } from './service';
import { ShortLessonPanel } from './ShortLessonPanel';
import type { SkillMarks, SkillProgress } from '../../types/learnpal';

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

/** The skill held in This week, or null (none, off, a quiet day, or the fetch failed). */
function useThisWeekSkill(): string | null {
  const [skill, setSkill] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    learnpalService.getThisWeek()
      .then((w) => { if (live) setSkill(w.enabled && w.lesson ? w.lesson.skill : null); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return skill;
}

/** The three marks, in words, in the order every card lists them. */
const TRAIL_MARKS: { key: keyof SkillMarks; label: string }[] = [
  { key: 'understood', label: 'Understood' },
  { key: 'used', label: 'Used on your money' },
  { key: 'remembered', label: 'Still remembered' },
];

/* Waypoint heights along the path (px from the top of a 70px band): a gentle rise and fall, as in 2A. */
const WAYPOINT_Y = [50, 32, 38, 52, 40, 22];

const markDot = (on: boolean): React.CSSProperties => ({
  flex: 'none', width: 12, height: 12, borderRadius: '50%', boxSizing: 'border-box',
  border: `2px solid ${on ? 'var(--g-ink)' : 'var(--text-secondary)'}`,
  background: on ? 'var(--g-ink)' : 'transparent',
});

const lessonLink: React.CSSProperties = {
  alignSelf: 'flex-start', marginTop: 'auto', minHeight: 44, padding: '0 2px', boxSizing: 'border-box',
  border: 0, background: 'transparent', color: 'var(--g-ink)', font: 'inherit', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', textAlign: 'left',
};

const SkillCard: React.FC<{ skill: SkillProgress; thisWeek: boolean; onOpen: (short: string) => void }> = (
  { skill, thisWeek, onOpen },
) => {
  const anyMark = skill.marks.understood || skill.marks.used || skill.marks.remembered;
  const linkText = skill.marks.understood ? 'Read why, 1 min' : 'Start, 1 min';
  return (
    <li className={`lp-trail__card${thisWeek ? ' lp-trail__card--this-week' : ''}`} data-testid="skill-card"
      data-this-week={thisWeek ? 'true' : 'false'}>
      {/* The vertical layout's waypoint, beside its card; hidden in the horizontal layout (CSS). */}
      <span aria-hidden="true" className={`lp-trail__dot lp-trail__dot--side${anyMark ? ' lp-trail__dot--on' : ''}`} />
      <span className="lp-trail__title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{skill.title}</span>
      {thisWeek && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-ink)' }}>This week</span>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TRAIL_MARKS.map(({ key, label }) => {
          const on = skill.marks[key];
          return (
            <li key={key} data-testid="skill-mark" data-mark={label} data-on={on ? 'true' : 'false'} style={{
              display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400,
            }}>
              <span aria-hidden="true" style={markDot(on)} />
              {label}
              {/* The fill is never the only signal (design standard: never colour alone). */}
              <span className="sr-only">{on ? ', yes' : ', not yet'}</span>
            </li>
          );
        })}
      </ul>
      {skill.short && (
        <button type="button" className="fp-ink-link" style={lessonLink} data-testid="skill-lesson-link"
          aria-label={`${linkText}: ${skill.title}`} onClick={() => onOpen(skill.short as string)}>
          {linkText}
        </button>
      )}
    </li>
  );
};

/** The trail itself; `SkillsCard` frames it, and it can be placed bare. */
export const SkillsTrail: React.FC<{ skills: SkillProgress[] }> = ({ skills: initial }) => {
  // Seeded once from the fetch; after that only a finished lesson changes a row.
  const [skills, setSkills] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const thisWeek = useThisWeekSkill();

  // A finished lesson hands back its skill's marks; fill them in place (marks only ever go up).
  const finished = (p: SkillProgress) => setSkills((rows) => rows.map((s) => (
    s.id === p.id ? { ...s, marks: p.marks } : s)));

  const n = skills.length;
  return (
    <div className="lp-trail">
      <div className="lp-trail__path" aria-hidden="true">
        <svg width="100%" height="70" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {skills.slice(1).map((_, i) => (
            <line key={i} x1={`${((i + 0.5) / n) * 100}%`} y1={WAYPOINT_Y[i % 6]}
              x2={`${((i + 1.5) / n) * 100}%`} y2={WAYPOINT_Y[(i + 1) % 6]}
              stroke="var(--border-light)" strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" />
          ))}
        </svg>
        {skills.map((s, i) => {
          const on = s.marks.understood || s.marks.used || s.marks.remembered;
          return (
            <span key={s.id} data-testid="skill-waypoint" className={`lp-trail__dot${on ? ' lp-trail__dot--on' : ''}`}
              style={{ left: `calc(${((i + 0.5) / n) * 100}% - 12px)`, top: WAYPOINT_Y[i % 6] - 12 }} />
          );
        })}
      </div>
      <ol className="lp-trail__cards" aria-label="Six skills">
        {skills.map((s) => (
          <SkillCard key={s.id} skill={s} thisWeek={thisWeek === s.id} onOpen={setOpen} />
        ))}
      </ol>
      <ShortLessonPanel shortId={open} onClose={() => setOpen(null)} onFinished={finished} />
    </div>
  );
};

export const SkillsCard: React.FC<{ skills: SkillProgress[] }> = ({ skills }) => (
  <div data-testid="skills-card">
    <SectionCard title="Your skills" subtitle="Six skills, each with three marks that only fill, in any order.">
      <SkillsTrail skills={skills} />
    </SectionCard>
  </div>
);

export default SkillsCard;
