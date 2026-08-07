import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

// *** 'error', NOT 'warn'. THE SUITE WAS NOT HERMETIC. ***
//
// With 'warn', a request no handler matches is logged and then sent to the REAL
// NETWORK. That is how a mistyped handler stayed invisible: DashboardMemberFilter
// registered `/api/v1/budgets/` while the service requests `/api/v1/budgets`, so
// the request escaped to jsdom's origin (http://localhost:3000) and the test
// passed on this machine — purely because an unrelated process happened to be
// listening on 3000. In CI it failed with ECONNREFUSED, which is the first time
// anything had ever run this suite outside a developer's laptop.
//
// A warning nobody reads is not a guard. 'error' makes an unhandled request fail
// the test that made it, so the suite can only pass on mocked data.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
