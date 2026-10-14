/**
 * The quick check at the end of a lesson (Phase 5d, 2026-10-15; spec: finPal/docs/phase5-learnpal-quiz-spec.md).
 *
 * *** IT IS AN OFFER, NOT A GATE. *** It opens only when the reader asks ("Check what stuck"), it is never
 * needed to finish a lesson, and recording the answers awards nothing (coins stay with finishing a lesson
 * or using a skill on real data).
 *
 * *** NO SCORE, NO RED, NO "WRONG". *** Every answer, right or not, turns over to its one-line explanation;
 * "Not sure" is always an answer and is explained like the others. The end says "You've got this one" or
 * "This is worth another look", never a number, and offers the lesson again and the lesson's one action.
 *
 * Core edition: the same quick check without the motion kit (decided 2026-10-12: quizzes reach core, the
 * animation stays premium and mobile). The stand-ins below keep the markup identical to premium's.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { learnpalService } from './service';
import type { LessonQuiz as Quiz } from '../../types/learnpal';

type Choice = '0' | '1' | '2' | 'not_sure';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
const still = ({ as = 'div', index, value, inView, ...rest }: any) => React.createElement(as, rest);
const Rise = still, Sheet = still, Pop = still, Turn = still;
const FillBar = ({ value = 0, index, style }: any) => <div style={{ width: `${value * 100}%`, height: '100%', ...style }} />;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

const optionStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginTop: 8,
  border: '1px solid var(--border-light)', borderRadius: 10, background: 'transparent',
  color: 'var(--text-primary)', fontSize: '0.9rem', cursor: 'pointer',
};
const linkButton: React.CSSProperties = {
  padding: 0, border: 0, background: 'transparent', color: 'var(--g-ink)',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};

/** A small drawn check (no emoji). */
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
    <path d="M2.5 7.5 L5.5 10.5 L11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LessonQuiz: React.FC<{
  slug: string;
  quiz: Quiz;
  /** Back to the top of the lesson, for "Read it again". */
  onReadAgain: () => void;
  /** The lesson's action leaves the reader, so the panel closes with it. */
  onLeave: () => void;
}> = ({ slug, quiz, onReadAgain, onLeave }) => {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [done, setDone] = useState(false);
  const questions = quiz.questions;

  const restart = () => { setAnswers({}); setIndex(0); setDone(false); };

  if (!open) {
    return (
      <section data-testid="lesson-quiz" data-state="invite" style={card}>
        <h3 style={heading}>{"Check what stuck"}</h3>
        <p className="fp-hint" style={{ margin: '4px 0 10px', lineHeight: 1.55 }}>
          {questions.length === 1 ? '1 question' : `${questions.length} questions`} from this lesson. Nothing is scored, and Not sure is always an answer.
        </p>
        <Button size="sm" data-testid="quiz-start" onClick={() => setOpen(true)}>
          {"Start"}
        </Button>
      </section>
    );
  }

  if (done) {
    const allRight = questions.every((q) => {
      const c = answers[q.id];
      return c !== undefined && c !== 'not_sure' && q.options[Number(c)]?.right;
    });
    return (
      <Rise as="section" data-testid="lesson-quiz" data-state="end" data-outcome={allRight ? 'got-it' : 'another-look'}
        style={card}>
        <h3 style={heading}>
          {allRight ? "You've got this one" : "This is worth another look"}
        </h3>
        <p className="fp-hint" style={{ margin: '4px 0 12px', lineHeight: 1.55 }}>
          {allRight ? "That idea is yours now. The step below puts it to work on your own money." : "Most ideas take a second read to settle. The lesson is here whenever you want it."}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <Link to={quiz.action.href} onClick={onLeave} data-testid="quiz-action" style={{ textDecoration: 'none' }}>
            <Button as="span" size="sm">{quiz.action.label}</Button>
          </Link>
          <button type="button" style={linkButton} data-testid="quiz-read-again"
            onClick={() => { restart(); setOpen(false); onReadAgain(); }}>
            {"Read it again"}
          </button>
          <button type="button" style={linkButton} data-testid="quiz-again" onClick={restart}>
            {"Try the questions again"}
          </button>
        </div>
      </Rise>
    );
  }

  const q = questions[index];
  const chosen = answers[q.id];
  const last = index === questions.length - 1;
  const choose = (c: Choice) => setAnswers((a) => ({ ...a, [q.id]: c }));
  const next = () => {
    if (!last) { setIndex(index + 1); return; }
    setDone(true);
    // Recorded for spaced recall (5e) and measurement (5g); nothing is awarded, and a failed save
    // changes nothing the reader sees.
    learnpalService.postQuiz(slug, questions
      .filter((x) => answers[x.id] !== undefined)
      .map((x) => ({ question_id: x.id, choice: answers[x.id] }))).catch(() => undefined);
  };

  const picked = chosen === undefined ? null
    : chosen === 'not_sure' ? { text: "Not sure", right: false, why: q.not_sure, notSure: true }
    : { ...q.options[Number(chosen)], notSure: false };

  return (
    <Sheet as="section" data-testid="lesson-quiz" data-state="ask" style={card} aria-labelledby={`quiz-q-${q.id}`}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}
        aria-label={`Question ${index + 1} of ${questions.length}`} role="img">
        {questions.map((x, i) => (
          <div key={x.id} data-testid="quiz-dot" data-filled={answers[x.id] !== undefined ? 'true' : 'false'}
            style={{ width: 22, height: 6, borderRadius: 3, background: 'var(--border-light)', overflow: 'hidden' }}>
            {answers[x.id] !== undefined && (
              <FillBar value={1} index={i} style={{ background: 'var(--g-ink)', borderRadius: 3 }} />
            )}
          </div>
        ))}
      </div>

      <Rise key={q.id}>
        <h3 id={`quiz-q-${q.id}`} style={heading}>{q.prompt}</h3>
        <Turn value={chosen ?? ''}>
          {picked === null ? (
            <div role="group" aria-labelledby={`quiz-q-${q.id}`}>
              {q.options.map((o, i) => (
                <Pop as="div" key={i} index={i}>
                  <button type="button" style={optionStyle}
                    data-testid={`quiz-option-${i}`} onClick={() => choose(String(i) as Choice)}>
                    {o.text}
                  </button>
                </Pop>
              ))}
              <Pop as="div" index={q.options.length}>
                <button type="button"
                  style={{ ...optionStyle, color: 'var(--text-secondary)' }}
                  data-testid="quiz-option-not-sure" onClick={() => choose('not_sure')}>
                  {"Not sure"}
                </button>
              </Pop>
            </div>
          ) : (
            <div data-testid="quiz-explanation" data-right={picked.right ? 'true' : 'false'} aria-live="polite"
              style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {picked.right && (
                  <Pop style={{ display: 'inline-block', marginRight: 6, color: 'var(--g-ink)' }}><Check /></Pop>
                )}
                {picked.text}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {picked.why}
              </p>
            </div>
          )}
        </Turn>
        {picked !== null && (
          <div style={{ marginTop: 12 }}>
            <Button size="sm" data-testid="quiz-next" onClick={next}>
              {last ? "See how it went" : "Next"}
            </Button>
          </div>
        )}
      </Rise>
    </Sheet>
  );
};

const card: React.CSSProperties = {
  marginTop: '2rem', padding: '16px 18px', border: '1px solid var(--border-light)',
  borderRadius: 12, background: 'var(--bg-card)',
};
const heading: React.CSSProperties = { margin: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 };

export default LessonQuiz;
