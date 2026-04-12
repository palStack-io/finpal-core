import { describe, it, expect } from 'vitest';
import { moduleRegistry } from '../../../modules';

describe('moduleRegistry', () => {
  it('has at least one module', () => {
    expect(moduleRegistry.length).toBeGreaterThan(0);
  });

  it('has a pointspal entry', () => {
    const pp = moduleRegistry.find(m => m.slug === 'pointspal');
    expect(pp).toBeDefined();
  });

  it('all slugs are unique', () => {
    const slugs = moduleRegistry.map(m => m.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('every module has required fields', () => {
    for (const m of moduleRegistry) {
      expect(m.slug).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(Array.isArray(m.navLinks)).toBe(true);
      expect(Array.isArray(m.routes)).toBe(true);
    }
  });
});
