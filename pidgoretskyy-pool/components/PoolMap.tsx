'use client';

import type { CSSProperties } from 'react';
import { SPOTS, CANOPY_SPOTS } from '@/lib/spots';

type Mode = 'client' | 'manual' | 'block';

interface PoolMapProps {
  selected: number[];
  booked: number[];
  blocked: number[];
  mode: Mode;
  onSpotClick: (id: number) => void;
}

// Парасольки (центри у %)
const UMBRELLAS: [number, number][] = [
  [3, 33], [13, 40], [13, 63], [4, 77],
  [30, 34], [30, 54],
  [69, 34], [69, 54],
  [44, 79], [51, 79], [58, 79],
];

// Споруди/зони (декоративні підписи)
const label: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.1,
  padding: 2,
  borderRadius: 6,
};

function Umbrella({ left, top }: { left: number; top: number }) {
  return (
    <div style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%,-50%)', width: 22, height: 16 }}>
      <div style={{ width: 22, height: 9, background: '#4A4038', borderRadius: '11px 11px 0 0' }} />
      <div style={{ width: 1.5, height: 7, background: '#8A8078', margin: '0 auto' }} />
    </div>
  );
}

export default function PoolMap({ selected, booked, blocked, mode, onSpotClick }: PoolMapProps) {
  const bookedSet = new Set(booked);
  const blockedSet = new Set(blocked);
  const selectedSet = new Set(selected);

  const poolWater = 'linear-gradient(165deg,#BBD9DD,#85B6BE)';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 640,
        margin: '0 auto',
        aspectRatio: '13 / 10',
        background: '#F5F5F7',
        border: '1px solid #E8E8ED',
        borderRadius: 16,
        overflow: 'hidden',
        fontFamily: 'var(--font-jost), sans-serif',
      }}
    >
      {/* Джакузі */}
      <div style={{ ...label, left: '11%', top: '5%', width: '14%', height: '13%', flexDirection: 'column', background: 'linear-gradient(165deg,#BBD9DD,#8FBEC6)', border: '2px solid #5A8088', color: '#2C4A50' }}>
        <span style={{ color: '#3A5C62' }}>Джакузі</span>
      </div>

      {/* Навіс над 21–32 */}
      <div style={{ position: 'absolute', left: '30%', top: '3.5%', width: '39%', height: '17%', background: 'rgba(140,140,150,0.16)', border: '1.5px dashed #B8B8BF', borderRadius: 10 }}>
        <span style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 600, color: '#86868B', letterSpacing: 1 }}>НАВІС</span>
      </div>

      {/* Основна чаша 150м */}
      <div style={{ position: 'absolute', left: '43%', top: '32%', width: '16%', height: '32%', background: poolWater, border: '3px solid #5A8088', borderRadius: 5 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 15, textShadow: '0 1px 3px rgba(0,0,0,.28)' }}>150м</div>
      </div>
      {/* Малий басейн 50м (верхній виступ) */}
      <div style={{ position: 'absolute', left: '46.5%', top: '29.5%', width: '9%', height: '8%', background: 'linear-gradient(180deg,#BBD9DD,#8FBEC6)', border: '3px solid #5A8088', borderBottom: 'none', borderRadius: '5px 5px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
        50м
      </div>

      {/* Парасольки */}
      {UMBRELLAS.map(([l, t], i) => (
        <Umbrella key={i} left={l} top={t} />
      ))}

      {/* Споруди праворуч */}
      <div style={{ ...label, left: '72%', top: '15%', width: '12%', height: '12%', flexDirection: 'column', background: '#2E6FB0', color: '#fff' }}>Будиночок №1</div>
      <div style={{ ...label, left: '88%', top: '15%', width: '11%', height: '12%', flexDirection: 'column', background: '#2E6FB0', color: '#fff' }}>Будиночок №2</div>
      <div style={{ ...label, left: '84.5%', top: '18.5%', width: '4%', height: '5%', color: '#6E6E73', fontSize: 9 }}>WC</div>
      <div style={{ ...label, left: '75%', top: '86%', width: '12%', height: '12%', background: '#2E6FB0', color: '#fff', fontSize: 12 }}>БАР</div>
      <div style={{ ...label, left: '88%', top: '86%', width: '11%', height: '12%', background: '#2E6FB0', color: '#fff' }}>Альтанка</div>

      {/* Лаундж-зона */}
      <div style={{ ...label, left: '27%', top: '87%', width: '40%', height: '11%', background: '#E3E3E8', color: '#6E6E73', fontStyle: 'italic', fontSize: 10.5 }}>
        Лаундж-зона для харчування
      </div>

      {/* Лежаки */}
      {SPOTS.map((c) => {
        const isBlocked = blockedSet.has(c.id);
        const isBooked = bookedSet.has(c.id);
        const isSel = selectedSet.has(c.id);
        const underCanopy = CANOPY_SPOTS.has(c.id);

        let bg = '#ffffff';
        let bd = '#D2D2D7';
        let col = '#6E6E73';
        let clickable = true;

        if (mode === 'block') {
          if (isBooked) {
            bg = '#E8E8ED'; bd = '#E8E8ED'; col = '#86868B'; clickable = false;
          } else if (isBlocked) {
            bg = '#C7C7CC'; bd = '#C7C7CC'; col = '#fff';
          }
        } else {
          if (isBlocked) {
            bg = '#C7C7CC'; bd = '#C7C7CC'; col = '#fff'; clickable = false;
          } else if (isBooked) {
            bg = '#E8E8ED'; bd = '#E8E8ED'; col = '#86868B'; clickable = false;
          } else if (isSel) {
            bg = '#1D1D1F'; bd = '#1D1D1F'; col = '#fff';
          }
        }

        const w = c.vertical ? 2.7 : 6.6;
        const h = c.vertical ? 6.2 : 4.0;

        return (
          <button
            key={c.id}
            type="button"
            title={'Місце ' + c.id + (underCanopy ? ' (під навісом)' : '')}
            aria-label={'Лежак ' + c.id}
            aria-pressed={isSel}
            disabled={!clickable}
            onClick={() => clickable && onSpotClick(c.id)}
            style={{
              position: 'absolute',
              left: `${c.left}%`,
              top: `${c.top}%`,
              transform: 'translate(-50%,-50%)',
              width: `${w}%`,
              height: `${h}%`,
              minWidth: 18,
              minHeight: 18,
              background: bg,
              border: `1.5px solid ${bd}`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 600,
              color: col,
              cursor: clickable ? 'pointer' : 'not-allowed',
              transition: 'background .15s',
              userSelect: 'none',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {c.id}
          </button>
        );
      })}
    </div>
  );
}
