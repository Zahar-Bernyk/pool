import type { CSSProperties } from 'react';

// Шрифти
export const SERIF = "var(--font-cormorant), 'Cormorant Garamond', serif";
export const SANS = "var(--font-jost), 'Jost', sans-serif";

// ─── Кнопки (пігулковий стиль основного сайту) ───────────────────────────
export const primaryBtn: CSSProperties = {
  background: '#1D1D1F',
  color: '#fff',
  border: '1px solid #1D1D1F',
  padding: '14px 36px',
  borderRadius: 100,
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
};
export const primaryBtnFull: CSSProperties = { ...primaryBtn, width: '100%' };

export const ghostBtn: CSSProperties = {
  background: '#fff',
  color: '#1D1D1F',
  border: '1px solid #D2D2D7',
  padding: '14px 28px',
  borderRadius: 100,
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
};
export const ghostBtnFull: CSSProperties = { ...ghostBtn, width: '100%', marginTop: 10 };

// ─── Степери (круглі кнопки +/−) ─────────────────────────────────────────
export const stepBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: '1px solid #D2D2D7',
  background: '#F5F5F7',
  fontSize: 18,
  cursor: 'pointer',
  color: '#1D1D1F',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
export const stepBtnSm: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid #D2D2D7',
  background: '#F5F5F7',
  fontSize: 15,
  cursor: 'pointer',
  color: '#1D1D1F',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ─── Поля вводу ──────────────────────────────────────────────────────────
export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: '1px solid #D2D2D7',
  borderRadius: 10,
  fontFamily: SANS,
  fontSize: 15,
  color: '#1D1D1F',
  background: '#F5F5F7',
  marginTop: 6,
};

// ─── Дрібні елементи ─────────────────────────────────────────────────────
export const eyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#86868B',
};

export const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #E8E8ED',
  borderRadius: 16,
  padding: 26,
};

export function tabStyle(on: boolean): CSSProperties {
  return {
    padding: '8px 20px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: 500,
    background: on ? '#1D1D1F' : 'transparent',
    color: on ? '#fff' : '#6E6E73',
  };
}

export function selectCard(on: boolean): CSSProperties {
  return {
    textAlign: 'left',
    cursor: 'pointer',
    padding: 18,
    borderRadius: 12,
    border: `1.5px solid ${on ? '#1D1D1F' : '#D2D2D7'}`,
    background: on ? '#F5F5F7' : '#fff',
    fontFamily: SANS,
    color: '#1D1D1F',
  };
}
