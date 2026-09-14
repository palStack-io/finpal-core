import { useQuery } from '@tanstack/react-query';

import { currencyService, type ServerCurrency } from '../services/currencyService';

/**
 * Every currency a user may choose, from the one place that knows (D-217).
 *
 * *** THE FALLBACK IS THE BRANDED SEVEN, NOT A SECOND LIST. *** If the request
 * fails the picker still has to render something, so it falls back to the codes
 * `config/branding.ts` already carries — the ones this client can name and draw
 * a symbol for. That is a degradation, not a disagreement: since D-215 the
 * server answers a code it does not stock with a named 400 rather than a 500.
 *
 * Reference data: an operator adds a row perhaps once, so it is cached for a day
 * rather than refetched per screen.
 */
export const useCurrencies = (): { currencies: ServerCurrency[]; fromServer: boolean } => {
  const { data } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => currencyService.list(),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const rows = data ?? [];
  return rows.length > 0
    ? { currencies: rows, fromServer: true }
    : { currencies: FALLBACK, fromServer: false };
};

/**
 * Only reached when the endpoint cannot be, and deliberately the SHORT list: a
 * client guessing at a longer one is what this hook exists to stop.
 */
const FALLBACK: ServerCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
];
