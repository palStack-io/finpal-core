import React from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, action, children }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: 'var(--card-shadow)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
      <div>
        {/* h2, not h3. A SectionCard is a top-level section beneath the page's
            single h1, and h1 -> h3 skips a level — which breaks the outline
            screen readers navigate by and was caught by the E2E heading check.
            The font size is inline, so nothing moves on screen. */}
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
    {children}
  </div>
);
