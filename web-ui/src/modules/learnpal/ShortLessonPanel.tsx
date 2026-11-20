/**
 * The one-minute lesson behind a "Why?" card: four short steps in a side panel.
 *
 *   1. Your number   2. What is going on   3. Try it on your numbers   4. Do one thing
 *
 * *** NO SCORE, NO GUILT. *** "Not now" is always there and says nothing about the person. Step 3 is a
 * read-only preview ("Nothing changes until you choose to"). Core edition: literal English, no motion.
 *
 * Finishing is recorded when the person reaches step 4 (`finished`), then upgraded by what they choose
 * there (`action`, or `not_now`). The server keeps marks monotonic, so the repeat posts are harmless.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SlidePanel } from '../../components/SlidePanel';
import { Button } from '../../components/common/Button';
import { formatMoney } from '../../styles/money';
import { useAuthStore } from '../../store/authStore';
import { learnpalService } from './service';
import type {
  InterestPoint, ShortLesson, ShortOutcome, ShortTry, SkillMarks, SkillProgress,
} from '../../types/learnpal';

const STEPS = 4;
const STEP_TITLES = ['Your number', 'What is going on', 'Try it on your numbers', 'Do one thing'];
const NEVER_CLEARS = "This payment doesn't get ahead of the interest yet";

/** Money in the lesson's own currency (the server's `try.currency`), else the person's. */
const moneyIn = (currency: string) => (v: string) => formatMoney(Number(v), { currency });

/** "Mar 2028", counted from today. */
const monthsFromNow = (months: number): string => {
  const d = new Date();
  d.setDate(1); // 31 Jan + 1 month would otherwise land in March
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

const marksLabel = (m: SkillMarks): string => [
  m.understood ? 'Understood' : 'Not yet understood',
  m.used ? 'used on your money' : 'not yet used',
  m.remembered ? 'remembered' : 'not yet remembered',
].join(', ');

/** Three dots: understood, used on your money, still remembered. */
export const SkillDots: React.FC<{ marks: SkillMarks }> = ({ marks }) => {
  const filled = [marks.understood, marks.used, marks.remembered];
  return (
    <span role="img" aria-label={marksLabel(marks)} data-testid="skill-dots"
      style={{ display: 'inline-flex', gap: 6 }}>
      {filled.map((on, i) => (
        <span key={i} aria-hidden="true" data-filled={on ? 'true' : 'false'} style={{
          width: 10, height: 10, borderRadius: '50%', boxSizing: 'border-box',
          border: '2px solid var(--g-ink)', background: on ? 'var(--g-ink)' : 'transparent',
        }} />
      ))}
    </span>
  );
};

const figure: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' };
const tile: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 10,
};
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' };
const linkButton: React.CSSProperties = {
  padding: 0, border: 0, background: 'transparent', color: 'var(--g-ink)',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={row}><span className="fp-hint">{label}</span><span style={figure}>{value}</span></div>
);

const InterestTry: React.FC<{ t: Extract<ShortTry, { kind: 'interest' }>; currency: string }> = ({ t, currency }) => {
  const money = moneyIn(currency);
  const [k, setK] = useState(0);
  const point: InterestPoint = t.points[k];
  const first = t.points[0];
  const base = Number(t.base_payment);
  const gets = point.months !== null && (k > 0 || t.covers_interest);
  const saved = gets && first.months !== null && first.interest_total !== null && point.interest_total !== null
    ? Number(first.interest_total) - Number(point.interest_total) : null;
  return (
    <div>
      <label htmlFor="try-extra" style={{ display: 'block', marginBottom: 8 }}>
        Extra each month: <strong data-testid="try-extra-value">{money(String(point.extra))}</strong>
      </label>
      <input id="try-extra" type="range" min={0} max={t.points.length - 1} step={1} value={k}
        aria-valuetext={`${money(String(point.extra))} extra a month`}
        onChange={(e) => setK(Number(e.target.value))} style={{ width: '100%' }} />
      <div style={{ ...tile, marginTop: 12 }} data-testid="try-result">
        <Stat label="Monthly payment" value={money(String(base + point.extra))} />
        {gets ? (
          <>
            <Stat label="Paid off" value={monthsFromNow(point.months as number)} />
            {point.interest_total !== null && (
              <Stat label="Interest over the way" value={money(point.interest_total)} />
            )}
            {saved !== null && saved > 0 && (
              <Stat label="Interest saved" value={money(saved.toFixed(2))} />
            )}
          </>
        ) : (
          <p style={{ margin: '6px 0 0' }}>{NEVER_CLEARS}</p>
        )}
      </div>
    </div>
  );
};

/** Read-only figures for every kind that has no slider. */
const FiguresTry: React.FC<{ t: Exclude<ShortTry, { kind: 'interest' }>; currency: string }> = ({ t, currency }) => {
  const money = moneyIn(currency);
  switch (t.kind) {
    case 'buffer':
      return (
        <div style={tile}>
          <Stat label="Your usual month" value={money(t.essential_monthly)} />
          <Stat label="Set aside so far" value={money(t.held)} />
          <Stat label="A first cushion" value={money(t.buffer_amount)} />
          {t.targets.map((x) => (
            <Stat key={x.months} label={`${x.months} months of essentials`} value={money(x.target)} />
          ))}
        </div>
      );
    case 'fixed_share':
      return (
        <div style={tile}>
          <Stat label="Came in" value={money(t.income)} />
          <Stat label="Already fixed" value={money(t.fixed_amount)} />
          <Stat label="Share of it" value={`${t.share_percent}%`} />
        </div>
      );
    case 'sinking':
      return (
        <div style={tile}>
          <Stat label={`${t.item}, a year`} value={money(t.yearly)} />
          <Stat label="Set aside a month" value={money(t.monthly)} />
        </div>
      );
    case 'month':
      return (
        <div style={tile}>
          <Stat label="Came in" value={money(t.income)} />
          <Stat label="Went out" value={money(t.spent)} />
          <Stat label={`Biggest: ${t.biggest_category}`} value={money(t.biggest_amount)} />
        </div>
      );
    case 'debt_order':
      return (
        <div style={tile}>
          {t.debts.map((d) => (
            <Stat key={d.name} label={`${d.name} at ${d.apr}%`} value={money(d.balance)} />
          ))}
        </div>
      );
  }
};

export interface ShortLessonPanelProps {
  shortId: string | null;
  onClose: () => void;
  onFinished?: (progress: SkillProgress) => void;
}

/** Keyed on `shortId`, so every lesson starts from fresh state without resetting it in an effect. */
export const ShortLessonPanel: React.FC<ShortLessonPanelProps> = (props) => (
  <ShortLessonPanelInner key={props.shortId ?? 'closed'} {...props} />
);

const ShortLessonPanelInner: React.FC<ShortLessonPanelProps> = ({ shortId, onClose, onFinished }) => {
  const navigate = useNavigate();
  const userCurrency = useAuthStore((st) => st.user?.default_currency_code) || 'USD';
  const [lesson, setLesson] = useState<ShortLesson | null>(null);
  const [failed, setFailed] = useState<'gone' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const busyRef = useRef(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<SkillProgress | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const finishedFor = useRef<string | null>(null);

  useEffect(() => {
    if (shortId === null) return;
    let live = true;
    learnpalService.getShortLesson(shortId)
      .then((l) => { if (live) setLesson(l); })
      .catch((err) => {
        if (live) setFailed((err as { response?: { status?: number } })?.response?.status === 404 ? 'gone' : 'error');
      });
    return () => { live = false; };
  }, [shortId, attempt]);

  // Focus follows the step, but never on the first render (the panel places focus itself).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  const record = async (outcome: ShortOutcome): Promise<void> => {
    if (!lesson) return;
    try {
      const p = await learnpalService.finishShortLesson(lesson.id, outcome);
      setProgress(p);
      onFinished?.(p);
    } catch { /* a failed save changes nothing the reader sees */ }
  };

  const go = (to: number) => {
    moved.current = true;
    setStep(to);
    if (to === STEPS - 1 && lesson && finishedFor.current !== lesson.id) {
      finishedFor.current = lesson.id;
      void record('finished');
    }
  };

  // One post at a time: a second click while the first is in flight does nothing.
  const guarded = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await work(); } finally { busyRef.current = false; setBusy(false); }
  };
  const notNow = () => guarded(async () => { await record('not_now'); setSnoozed(true); });
  const takeAction = () => guarded(async () => {
    if (!lesson) return;
    await record('action');
    onClose();
    navigate(lesson.action.href);
  });

  const body = () => {
    if (failed === 'gone') return <p>This one doesn't apply to your numbers right now.</p>;
    if (failed === 'error') {
      return (
        <div>
          <p>We couldn't load this lesson. Try again in a moment.</p>
          <Button onClick={() => { setFailed(null); setAttempt((n) => n + 1); }}>Try again</Button>
        </div>
      );
    }
    if (!lesson) return <p className="fp-hint">Loading…</p>;
    const last = step === STEPS - 1;
    return (
      <div data-testid="short-lesson" data-step={step + 1}>
        <p className="fp-hint" role="status" style={{ margin: '0 0 4px' }}>
          {`Step ${step + 1} of ${STEPS}`}
        </p>
        <div aria-hidden="true" style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {STEP_TITLES.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? 'var(--g-ink)' : 'var(--border-light)',
            }} />
          ))}
        </div>
        <h3 ref={heading} tabIndex={-1} style={{ fontSize: 18, margin: '0 0 10px', outline: 'none' }}>
          {last ? 'Want to make it real?' : STEP_TITLES[step]}
        </h3>

        {step === 0 && <p data-testid="short-number" style={{ fontSize: 17, lineHeight: 1.5 }}>{lesson.number}</p>}

        {step === 1 && lesson.explain.map((line, i) => (
          <p key={i} style={{ lineHeight: 1.55, margin: '0 0 10px' }}>{line}</p>
        ))}

        {step === 2 && (
          <>
            {lesson.try.kind === 'interest'
              ? <InterestTry t={lesson.try} currency={lesson.try.currency || userCurrency} />
              : <FiguresTry t={lesson.try} currency={lesson.try.currency || userCurrency} />}
            <p className="fp-hint" style={{ marginTop: 10 }}>
              Nothing changes until you choose to. This is only a preview.
            </p>
          </>
        )}

        {step === 3 && snoozed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p data-testid="short-not-now-line" style={{ margin: 0 }}>{lesson.lines.not_now}</p>
            <Button data-testid="short-close" onClick={onClose}>Close</Button>
          </div>
        )}

        {step === 3 && !snoozed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button data-testid="short-action" onClick={takeAction} disabled={busy}>{lesson.action.label}</Button>
            <button type="button" style={{ ...linkButton, alignSelf: 'flex-start' }} disabled={busy}
              data-testid="short-not-now" onClick={notNow}>Not now</button>
            {progress && (
              <div style={{ ...tile, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                data-testid="skill-row">
                <span><strong>{progress.title}</strong><br />
                  <span className="fp-hint">
                    {progress.marks.used ? 'Understood and used.' : lesson.lines.understood}
                  </span></span>
                <SkillDots marks={progress.marks} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {step > 0 && !snoozed && <Button variant="outline" onClick={() => go(step - 1)}>Back</Button>}
          {!last && <Button data-testid="short-next" onClick={() => go(step + 1)}>Next</Button>}
        </div>

        {lesson.long_lesson && (
          <p style={{ marginTop: 16 }}>
            <Link to={`/learnpal/lessons?lesson=${encodeURIComponent(lesson.long_lesson)}`} onClick={onClose} data-testid="short-read-more"
              data-lesson={lesson.long_lesson}>Read more</Link>
          </p>
        )}
      </div>
    );
  };

  return (
    <SlidePanel isOpen={shortId !== null} onClose={onClose} title={lesson?.skill_title ?? 'A short lesson'} width="420px">
      {body()}
    </SlidePanel>
  );
};

export default ShortLessonPanel;
