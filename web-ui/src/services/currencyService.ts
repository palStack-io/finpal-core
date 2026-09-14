import api from './api';

/**
 * The currencies this server stocks (D-217).
 *
 * *** THE LIST IS THE SERVER'S, BECAUSE THE FOREIGN KEY IS. ***
 * `users.default_currency_code` points at the `currencies` table, and until
 * `GET /api/v1/currencies` existed no client could ask what was in it — so this
 * one offered **six** (`config/branding.ts`), mobile offered twenty, and the
 * seed stocks twenty-two. Owner instruction, 2026-09-14: *"we need to stick the
 * number of currencies thats on our backend, i think we manually seed it
 * right"*.
 *
 * *** THE PATH CARRIES `/api/v1` BECAUSE THIS CLIENT'S `baseURL` IS THE EMPTY
 * STRING. *** A bare path here does not 404 — Vite serves `index.html` and
 * axios hands back a 200 with an HTML string, which typechecks fine and reads
 * as an empty list. That is D-211, and it shipped once.
 */
export interface ServerCurrency {
  code: string;
  name: string;
  symbol: string;
}

export const currencyService = {
  async list(): Promise<ServerCurrency[]> {
    const { data } = await api.get<{ success: boolean; currencies: ServerCurrency[] }>(
      '/api/v1/currencies/');
    return data.currencies ?? [];
  },
};
