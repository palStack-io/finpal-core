import { api } from './api';

/**
 * The module catalogue and the data statement — both from the server, neither
 * written here.
 *
 * *** THE PROSE IS THE SERVER'S, OWNER DECISION 2026-09-13. *** Copy inside a
 * client can only be corrected by shipping it, and mobile ships through a store
 * review with iOS EAS withheld. So this file declares the SHAPE and holds none
 * of the words — a hardcoded fallback sentence here would be the whole point of
 * the decision, undone.
 *
 * *** THE PATH IS ABSOLUTE, AND THAT IS NOT A STYLE CHOICE. *** `api`'s
 * `baseURL` is the EMPTY STRING in this client. `coinService.ts` was written as
 * `/coins` on 2026-09-14, Vite served `index.html` for it, axios handed back a
 * 608-character HTML string, and the page crashed on the first `.filter()` —
 * with a green typecheck throughout, because a string is a valid `unknown`.
 * Every path in this directory is written in full.
 *
 * Captured from a real `GET /api/v1/modules/catalog` on 2026-09-14, not derived
 * from the handler:
 *
 *   { "success": true,
 *     "modules": [ { "slug": "pointspal", "name": "pointsPal",
 *                    "intro": "Which card to pay with…", "gives": "nothing to collect…" } ],
 *     "data": { "heading": "Your money stays on your server.",
 *               "lines": ["finPal has no analytics…", "…", "…"],
 *               "operator_note": "finPal is open source and runs on a server…" } }
 */
export interface ModuleCopy {
  slug: string;
  name: string;
  intro: string;
  gives: string;
}

export interface DataStatementPayload {
  heading: string;
  lines: string[];
  operator_note: string;
}

export interface OrientationPanel {
  title: string;
  question: string;
  answer: string;
}

export interface OrientationCopy {
  welcome: { heading: string; lines: string[] };
  mountains: {
    heading: string;
    lines: string[];
    examples: Array<{ label: string; text: string }>;
  };
  game: { heading: string; panels: OrientationPanel[]; promises: string[] };
  modules: { heading: string; lines: string[] };
  base_camp: { heading: string; lines: string[] };
}

export interface ModuleCatalog {
  success: boolean;
  modules: ModuleCopy[];
  data: DataStatementPayload;
  orientation: OrientationCopy;
  /** The three acts base camp offers — slug and title only. NO ceiling: it is a
   *  denominator finPal chose and stays on the server (decision 5). */
  first_acts: Array<{ slug: string; title: string }>;
}

export const onboardingService = {
  /** Unauthenticated on the server: it carries no user data and must render
   *  before a session has settled. */
  getCatalog: async (): Promise<ModuleCatalog> => {
    const response = await api.get<ModuleCatalog>('/api/v1/modules/catalog');
    return response.data;
  },
};
