'use client';

import type { CSSProperties } from 'react';
import { SPOTS } from '@/lib/spots';

type Mode = 'client' | 'manual' | 'block';

interface PoolMapProps {
  selected: number[];
  booked: number[];
  blocked: number[];
  mode: Mode;
  onSpotClick: (id: number) => void;
}

const umbrella: CSSProperties = {
  position: 'absolute',
  width: 26,
  height: 13,
  background: '#4A4038',
  borderRadius: '13px 13px 0 0',
};

export default function PoolMap({ selected, booked, blocked, mode, onSpotClick }: PoolMapProps) {
  const bookedSet = new Set(booked);
  const blockedSet = new Set(blocked);
  const selectedSet = new Set(selected);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        margin: '0 auto',
        aspectRatio: '5 / 8',
        background: '#FBF8F3',
        border: '1px solid #E8DFD2',
        borderRadius: 16,
        overflow: 'hidden',
        fontFamily: 'var(--font-jost), sans-serif',
      }}
    >
      {/* Малий басейн 50м (верхній виступ) */}
      <div
        style={{
          position: 'absolute',
          left: '43%',
          top: '29.5%',
          width: '14%',
          height: '8%',
          background: 'linear-gradient(180deg,#BBD9DD,#8FBEC6)',
          border: '3px solid #5A8088',
          borderBottom: 'none',
          borderRadius: '5px 5px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 9,
          fontWeight: 600,
          textShadow: '0 1px 2px rgba(0,0,0,.3)',
        }}
      >
        50м
      </div>

      {/* Основна чаша 150м */}
      <div
        style={{
          position: 'absolute',
          left: '33%',
          top: '36%',
          width: '34%',
          height: '27%',
          background: 'linear-gradient(165deg,#BBD9DD,#85B6BE)',
          border: '3px solid #5A8088',
          borderRadius: 5,
          boxShadow: 'inset 0 0 30px rgba(255,255,255,.5)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: 1,
            textShadow: '0 1px 3px rgba(0,0,0,.28)',
          }}
        >
          150м
        </div>
        <div
          style={{
            position: 'absolute',
            left: 5,
            top: '50%',
            transform: 'translateY(-50%) rotate(180deg)',
            writingMode: 'vertical-rl',
            color: '#fff',
            fontSize: 9,
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,.3)',
          }}
        >
          15м
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,.3)',
          }}
        >
          6м
        </div>
      </div>

      {/* Парасольки */}
      <div style={{ ...umbrella, left: '6%', top: '39%' }} />
      <div style={{ ...umbrella, left: '6%', top: '59%' }} />
      <div style={{ ...umbrella, left: '88%', top: '39%' }} />
      <div style={{ ...umbrella, left: '88%', top: '59%' }} />
      <div style={{ ...umbrella, left: '38%', top: '87%' }} />
      <div style={{ ...umbrella, left: '62%', top: '87%' }} />

      {/* Шезлонги 1–40 */}
      {SPOTS.map((c) => {
        const isBlocked = blockedSet.has(c.id);
        const isBooked = bookedSet.has(c.id);
        const isSel = selectedSet.has(c.id);

        let bg = '#ffffff';
        let bd = '#C9B89F';
        let col = '#5C5248';
        let clickable = true;

        if (mode === 'block') {
          if (isBooked) {
            bg = '#E8E1D5';
            bd = '#E8E1D5';
            col = '#9A8E7E';
            clickable = false;
          } else if (isBlocked) {
            bg = '#C7B0A3';
            bd = '#C7B0A3';
            col = '#fff';
          }
        } else {
          if (isBlocked) {
            bg = '#C7B0A3';
            bd = '#C7B0A3';
            col = '#fff';
            clickable = false;
          } else if (isBooked) {
            bg = '#E8E1D5';
            bd = '#E8E1D5';
            col = '#9A8E7E';
            clickable = false;
          } else if (isSel) {
            bg = '#2E2A24';
            bd = '#2E2A24';
            col = '#fff';
          }
        }

        const w = c.vertical ? 4.2 : 10;
        const h = c.vertical ? 7.5 : 4.6;

        return (
          <button
            key={c.id}
            type="button"
            title={'Місце ' + c.id}
            aria-label={'Шезлонг ' + c.id}
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
              minWidth: 22,
              minHeight: 22,
              background: bg,
              border: `1.5px solid ${bd}`,
              borderRadius: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: col,
              cursor: clickable ? 'pointer' : 'not-allowed',
              transition: 'transform .12s, background .15s',
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
