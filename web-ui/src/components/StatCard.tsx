import React, { useState } from 'react';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';

interface StatCardProps {
  label: string;
  value: string;
  accentColor: string;
  icon: React.ReactNode;
  subtitle?: React.ReactNode;
  valueColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, accentColor, icon, subtitle, valueColor }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? accentColor + '66' : 'var(--border-light)'}`,
        borderRadius: '16px',
        padding: '24px',
        boxShadow: hovered ? '0 8px 24px var(--card-hover-shadow)' : 'var(--card-shadow)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>{label}</p>
          <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: valueColor || 'var(--text-primary)', margin: 0 }}>{value}</h3>
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          background: accentColor + '33',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      {subtitle && (
        <div style={flexRowGap8}>
          {subtitle}
        </div>
      )}
    </div>
  );
};
