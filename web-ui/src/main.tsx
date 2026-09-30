import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

/*
 * *** WITHOUT THIS PROVIDER THE ONBOARDING PAGE RENDERS ZERO BYTES, AND IT IS
 * THE FIRST SCREEN AFTER EVERY NEW SIGNUP (D-286). ***
 *
 * `useCurrencies` calls `useQuery`, `Onboarding.tsx` calls `useCurrencies()`,
 * and no `QueryClientProvider` was mounted anywhere. React Query throws
 * *"No QueryClient set, use QueryClientProvider to set one"* during render,
 * React unmounts the tree, and `#root` ends up holding **zero bytes of HTML**
 * — the page paints its background and nothing else. No message, no fallback,
 * nothing for the user to act on.
 *
 * *** WHY NOTHING CAUGHT IT, WHICH IS THE REUSABLE PART: *** the route
 * resolves, nginx serves index.html correctly (200), the API is healthy, the
 * backend suite is green, `npm run typecheck` is clean — and the component
 * tests that render Onboarding mount it inside their own wrapper, so they
 * supply the provider production does not. **A test that provides the missing
 * thing cannot detect its absence.** Only driving the real deployed bundle
 * found it: `#root innerHTML length: 0`, one pageerror, a cream rectangle.
 *
 * The defaults are deliberate rather than inherited:
 *   - `retry: 1` — one retry, not three. A failed reference-data fetch should
 *     surface quickly, not after four round trips.
 *   - `refetchOnWindowFocus: false` — refetching because somebody alt-tabbed
 *     is surprising flicker in a financial UI.
 *   - `staleTime: 5 minutes` — currencies and categories do not change while
 *     a user fills in a form.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
