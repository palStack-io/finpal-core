import React from 'react';

interface CardFaceProps {
  issuerColor: 'chase' | 'amex' | 'citi' | 'cap1' | 'default';
  cardName: string;
  issuer: string;
  points: number | string;
  ptsLabel: string;
  style?: React.CSSProperties;
}

const gradients: Record<string, string> = {
  chase:   'linear-gradient(135deg, #1a237e, #3949ab)',
  amex:    'linear-gradient(135deg, #004d40, #00897b)',
  citi:    'linear-gradient(135deg, #b71c1c, #c62828)',
  cap1:    'linear-gradient(135deg, #212121, #424242)',
  default: 'linear-gradient(135deg, #334155, #475569)',
};

const CardFace: React.FC<CardFaceProps> = ({
  issuerColor,
  cardName,
  issuer,
  points,
  ptsLabel,
  style,
}) => {
  const gradient = gradients[issuerColor] ?? gradients.default;

  return (
    <div
      style={{
        background: gradient,
        position: 'relative',
        overflow: 'hidden',
        padding: '14px 16px 12px',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        ...style,
      }}
    >
      {/* Shine overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* Chip */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          width: 24,
          height: 18,
          background: 'linear-gradient(135deg, var(--au300), var(--au400))',
          borderRadius: 3,
          opacity: 0.85,
        }}
      />

      {/* Points badge — top right */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(8px)',
          borderRadius: 20,
          padding: '3px 10px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          border: '1px solid rgba(255,255,255,0.25)',
        }}
      >
        <span
          style={{
            color: '#fff',
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          {typeof points === 'number' ? points.toLocaleString() : points}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>{ptsLabel}</span>
      </div>

      {/* Card name */}
      <div
        style={{
          color: '#fff',
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 2,
          position: 'relative',
        }}
      >
        {cardName}
      </div>

      {/* Issuer sub-label */}
      <div
        style={{
          color: 'rgba(255,255,255,0.65)',
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          position: 'relative',
        }}
      >
        {issuer}
      </div>
    </div>
  );
};

export default CardFace;
