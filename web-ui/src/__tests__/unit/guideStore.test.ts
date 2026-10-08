import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGuideStore, isGuideOpen } from '../../store/guideStore';
import { useAuthStore } from '../../store/authStore';

const service = vi.hoisted(() => ({
  getGuides: vi.fn(), dismissGuide: vi.fn(), completeTour: vi.fn(),
}));
vi.mock('../../services/onboardingService', () => ({ onboardingService: service }));

const COPY = { heading: 'H', lines: ['a', 'b'], pose: 'map' as const };

beforeEach(() => {
  useGuideStore.getState().reset();
  Object.values(service).forEach((f) => f.mockReset());
});

describe('guideStore', () => {
  it('loads once and keeps what the server said', async () => {
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: ['goals'], toured: [], lang: 'en' });
    await useGuideStore.getState().load();
    await useGuideStore.getState().load();
    expect(service.getGuides).toHaveBeenCalledTimes(1);
    expect(useGuideStore.getState().status).toBe('ready');
    expect(useGuideStore.getState().dismissed).toEqual(['goals']);
  });

  it('a failed load is "failed", never half-ready, and can be retried', async () => {
    service.getGuides.mockRejectedValueOnce(new Error('offline'));
    await useGuideStore.getState().load();
    expect(useGuideStore.getState().status).toBe('failed');
    expect(useGuideStore.getState().pages).toEqual({});
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: [], toured: [], lang: 'en' });
    await useGuideStore.getState().load();
    expect(useGuideStore.getState().status).toBe('ready');
  });

  it('dismiss adopts the server list and closes a reopened card', async () => {
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: [], toured: [], lang: 'en' });
    await useGuideStore.getState().load();
    useGuideStore.getState().reopen('goals');
    service.dismissGuide.mockResolvedValue({ dismissed: ['goals'], toured: [] });
    await useGuideStore.getState().dismiss('goals');
    expect(useGuideStore.getState().dismissed).toEqual(['goals']);
    expect(useGuideStore.getState().reopened).toBeNull();
  });

  it('a failed dismiss leaves the card up so the click can be retried', async () => {
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: [], toured: [], lang: 'en' });
    await useGuideStore.getState().load();
    service.dismissGuide.mockRejectedValue(new Error('offline'));
    await useGuideStore.getState().dismiss('goals');
    expect(useGuideStore.getState().dismissed).toEqual([]);
  });

  it('reopen and closeReopened never write to the server', () => {
    useGuideStore.getState().reopen('goals');
    useGuideStore.getState().closeReopened();
    expect(service.dismissGuide).not.toHaveBeenCalled();
  });

  it('finishing a tour records it and ends the tour', async () => {
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: [], toured: [], lang: 'en' });
    await useGuideStore.getState().load();
    useGuideStore.getState().startTour('goals');
    service.completeTour.mockResolvedValue({ dismissed: [], toured: ['goals'] });
    await useGuideStore.getState().finishTour('goals');
    expect(useGuideStore.getState().toured).toEqual(['goals']);
    expect(useGuideStore.getState().touring).toBeNull();
  });

  it('asks for the language it is given, and refetches when the language changes', async () => {
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: [], toured: [], lang: 'en' });
    await useGuideStore.getState().load('en');
    await useGuideStore.getState().load('en');
    expect(service.getGuides).toHaveBeenCalledTimes(1);
    expect(service.getGuides).toHaveBeenLastCalledWith('en');
    await useGuideStore.getState().load('es');
    expect(service.getGuides).toHaveBeenCalledTimes(2);
    expect(service.getGuides).toHaveBeenLastCalledWith('es');
  });

  it('forgets everything when the signed-in user changes or logs out (review finding 2)', async () => {
    useAuthStore.setState({ user: { id: 'a@x.io' } as never, isAuthenticated: true });
    service.getGuides.mockResolvedValue({ pages: { goals: COPY }, dismissed: ['goals'], toured: [], lang: 'en' });
    await useGuideStore.getState().load('en');
    expect(useGuideStore.getState().dismissed).toEqual(['goals']);
    useAuthStore.setState({ user: { id: 'b@x.io' } as never });
    expect(useGuideStore.getState().status).toBe('idle');
    expect(useGuideStore.getState().dismissed).toEqual([]);

    await useGuideStore.getState().load('en');
    useAuthStore.setState({ user: null, isAuthenticated: false });
    expect(useGuideStore.getState().status).toBe('idle');
  });

  it('survives a 200 whose body is not a guides payload (an odd proxy, an old backend)', async () => {
    for (const body of [{}, '<html>ok</html>', null, { pages: null, dismissed: 'x' }]) {
      useGuideStore.getState().reset();
      service.getGuides.mockResolvedValue(body);
      await useGuideStore.getState().load('en');
      const s = useGuideStore.getState();
      expect(s.pages).toEqual({});
      expect(Array.isArray(s.dismissed) && Array.isArray(s.toured)).toBe(true);
    }
  });

  it('isGuideOpen: open on first visit or when reopened, never while loading or after a dismissal', () => {
    const st = (over: object) => ({ ...useGuideStore.getState(), ...over }) as never;
    const base = { status: 'ready', pages: { goals: COPY }, dismissed: [], reopened: null };
    expect(isGuideOpen(st(base), 'goals')).toBe(true);
    expect(isGuideOpen(st({ ...base, status: 'loading' }), 'goals')).toBe(false);
    expect(isGuideOpen(st({ ...base, pages: {} }), 'goals')).toBe(false);
    expect(isGuideOpen(st({ ...base, dismissed: ['goals'] }), 'goals')).toBe(false);
    expect(isGuideOpen(st({ ...base, dismissed: ['goals'], reopened: 'goals' }), 'goals')).toBe(true);
  });
});
