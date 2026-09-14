import { useEffect, useState } from 'react';

import {
  onboardingService,
  type DataStatementPayload,
  type ModuleCatalog,
  type ModuleCopy,
} from '../services/onboardingService';

/**
 * The catalogue, fetched once per mount.
 *
 * *** NO ERROR STATE IS EXPOSED ON PURPOSE. *** Every consumer's answer to a
 * failure is "render nothing" — a half-stated promise is worse than no promise
 * and an error box about privacy copy would alarm a user about the wrong thing.
 * The failure is logged where a self-hoster can see it and nowhere else.
 */
export function useDataStatement() {
  const [data, setData] = useState<DataStatementPayload | null>(null);
  const [modules, setModules] = useState<ModuleCopy[]>([]);
  const [catalog, setCatalog] = useState<ModuleCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    onboardingService
      .getCatalog()
      .then((catalog) => {
        if (!alive) return;
        setData(catalog.data ?? null);
        setModules(catalog.modules ?? []);
        setCatalog(catalog);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('finPal: could not load the module catalogue', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, modules, catalog };
}
