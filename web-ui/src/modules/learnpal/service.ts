/**
 * learnPal API client.
 *
 * *** A 404 HERE MEANS THE MODULE IS OFF, NOT THAT SOMETHING BROKE. *** The
 * backend only registers the namespace when `LEARNPAL_ENABLED` is on, so the
 * range resolves to `null` rather than throwing, and every caller renders
 * nothing on `null`. Treating it as an error would put a red banner on the
 * goals page of every deployment that simply does not use learnPal.
 */

import { api } from '../../services/api';
import type { LearnRange, LearnStats, LessonDetail, LessonRow } from '../../types/learnpal';

const notInstalled = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 404;

export const learnpalService = {
  /** `null` when learnPal is not installed. */
  async getRange(): Promise<LearnRange | null> {
    try {
      const r = await api.get<{ success: boolean; range: LearnRange }>(
        '/api/v1/learnpal/range');
      return r.data.range;
    } catch (err) {
      if (notInstalled(err)) return null;
      throw err;
    }
  },

  /** `null` when learnPal is not installed. The home page's own payload. */
  async getStats(): Promise<LearnStats | null> {
    try {
      const r = await api.get<{ success: boolean; stats: LearnStats }>(
        '/api/v1/learnpal/stats');
      return r.data.stats;
    } catch (err) {
      if (notInstalled(err)) return null;
      throw err;
    }
  },

  async getLessons(): Promise<{ lessons: LessonRow[]; read: number; total: number } | null> {
    try {
      const r = await api.get<{ success: boolean; lessons: LessonRow[];
                                read: number; total: number }>(
        '/api/v1/learnpal/lessons');
      return { lessons: r.data.lessons, read: r.data.read, total: r.data.total };
    } catch (err) {
      if (notInstalled(err)) return null;
      throw err;
    }
  },

  async getLesson(slug: string): Promise<LessonDetail> {
    const r = await api.get<{ success: boolean; lesson: LessonDetail }>(
      `/api/v1/learnpal/lessons/${encodeURIComponent(slug)}`);
    return r.data.lesson;
  },

  /**
   * *** THIS CANNOT UNLOCK ANYTHING. *** The server refuses a slug the user has
   * not earned (409). It records that an already-earned lesson was read, which
   * is what the daily queue needs — points still come from ANSWERING.
   */
  async markRead(slug: string): Promise<void> {
    await api.post(`/api/v1/learnpal/lessons/${encodeURIComponent(slug)}/read`, {});
  },
};
