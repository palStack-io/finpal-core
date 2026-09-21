/**
 * Opens a lesson and reads it, from anywhere that lists one.
 *
 * *** THE REASON THIS IS A COMPONENT RATHER THAN A SECOND COPY. *** Owner,
 * 2026-09-16: *"on learnpal, i cant seem to click on my recently finished
 * lessons. we should be able to do that"*. They were right — `Home`'s
 * "Recently finished" rows were plain `<li>`s with no affordance at all, while
 * `Lessons` had a working reader eight lines of JSX away: a Read button, a
 * fetch, an opening state, an error, and a `SlidePanel` around `LessonBody`.
 *
 * Copying that into `Home` would have been the quick fix and it would have put
 * the same five-part behaviour in two files — including the two conditions that
 * are easy to get wrong and invisible when wrong. So the behaviour moved here
 * and both callers use it.
 *
 * *** THE TWO CONDITIONS, BECAUSE THEY ARE THE PART A COPY WOULD DROP. ***
 *
 *  1. `has_body` DECIDES WHETHER A READER IS OFFERED AT ALL. Eleven approved
 *     drafts are unseeded and four lessons are deliberately unwritten (they are
 *     jurisdiction-bound), so an EARNED lesson with nothing to read is an
 *     expected state, not an error. Offering a reader onto blank space looks
 *     broken, and `Lessons`'s own header says so. A row without a body still
 *     says "no write-up yet" — it just is not clickable, which is the honest
 *     shape of "there is nothing here yet".
 *
 *  2. THE PANEL IS KEYED ON THE FETCHED DETAIL, NOT ON THE ROW. The list row
 *     carries a title and a flag; the body comes from `GET /lessons/<slug>`. So
 *     the panel opens when the detail lands, not when the click happens — which
 *     is why `opening` exists as a separate state and why the trigger disables
 *     itself rather than letting a second click stack two fetches.
 */

import React, { useState } from 'react';
import { SlidePanel } from '../../components/SlidePanel';
import LessonBody from './LessonBody';
import { learnpalService } from './service';
import { apiErrorMessage } from '../../utils/apiError';
import type { LessonDetail } from '../../types/learnpal';

/** The least a row must carry to be openable. */
export interface ReadableLesson {
  slug: string;
  title: string;
  has_body: boolean;
}

export interface LessonReaderApi {
  /** The panel. Render it once, anywhere in the subtree. */
  panel: React.ReactNode;
  /**
   * Whether this row can be opened at all. Callers ask rather than re-deriving
   * `earned && has_body`, so the rule lives in one place.
   */
  canOpen: (row: ReadableLesson) => boolean;
  /** Props for whatever the caller uses as the trigger. */
  open: (row: ReadableLesson) => void;
  /** The slug currently being fetched, for a caller's own "Opening…" label. */
  opening: string | null;
  /** A failed open, so the caller can put it where its own errors go. */
  error: string | null;
}

export function useLessonReader(): LessonReaderApi {
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (row: ReadableLesson) => {
    setOpening(row.slug);
    setError(null);
    learnpalService.getLesson(row.slug)
      .then(setDetail)
      .catch((err) => setError(apiErrorMessage(err, 'Could not open that lesson.')))
      .finally(() => setOpening(null));
  };

  return {
    canOpen: (row) => row.has_body,
    open,
    opening,
    error,
    panel: (
      <SlidePanel
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.title ?? 'Lesson'}
      >
        {/* `LessonBody` builds React elements and never produces HTML, so there
            is nothing to sanitise — which is how the markdown question that
            deferred this got answered by not being raised. Its own header
            carries the rest. */}
        <LessonBody markdown={detail?.body_md ?? null} />
      </SlidePanel>
    ),
  };
}

export default useLessonReader;
