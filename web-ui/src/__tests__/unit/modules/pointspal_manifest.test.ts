import { describe, it, expect } from 'vitest';
import manifest from '../../../modules/pointspal/manifest';

describe('pointsPal manifest', () => {
  it('has slug pointspal', () => {
    expect(manifest.slug).toBe('pointspal');
  });

  it('has 5 navLinks', () => {
    expect(manifest.navLinks).toHaveLength(5);
  });

  it('has 5 routes', () => {
    expect(manifest.routes).toHaveLength(5);
  });

  it('all navLinks have label and path', () => {
    for (const link of manifest.navLinks) {
      expect(link.label).toBeTruthy();
      expect(link.path).toMatch(/^\/pointspal/);
    }
  });

  it('all routes have path and component', () => {
    for (const route of manifest.routes) {
      expect(route.path).toMatch(/^\/pointspal/);
      expect(route.component).toBeDefined();
    }
  });

  it('cap tracker navLink has hasAlert', () => {
    const capLink = manifest.navLinks.find(l => l.path === '/pointspal/caps');
    expect(capLink?.hasAlert).toBeDefined();
  });
});
