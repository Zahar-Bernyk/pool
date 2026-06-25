import type { CSSProperties } from 'react';

// Шрифти
export const SERIF = "var(--font-cormorant), 'Cormorant Garamond', serif";
export const SANS = "var(--font-jost), 'Jost', sans-serif";

// ─── Кнопки ──────────────────────────────────────────────────────────────
export const primaryBtn: CSSProperties = {
  background: '#2E2A24',
  color: '#fff',
  border: 'none',
  padding: '14px 26px',
  borderRadius: 12,
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
};
export const primaryBtnFull: CSSProperties = { ...primaryBtn, width: '100%' };

export const ghostBtn: CSSProperties = {
  background: '#fff',
  color: '#3A322A',
  border: '1px solid #DECFBC',
  padding: '14px 20px',
  borderRadius: 12,
  fontFamily: SANS,
  fontSize: 15,
  cursor: 'pointer',
};
export const ghostBtnFull: CSSProperties = { ...ghostBtn, width: '100%', marginTop: 10 };

// ─── Степери ─────────────────────────────────────────────────────────────
export const stepBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: '1px solid #DECFBC',
  background: '#FBF8F3',
  fontSize: 18,
  cursor: 'pointer',
  color: '#3A322A',
};
export const stepBtnSm: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid #DECFBC',
  background: '#FBF8F3',
  fontSize: 15,
  cursor: 'pointer',
  color: '#3A322A',
};

// ─── Поля вводу ──────────────────────────────────────────────────────────
export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '13px 15px',
  border: '1px solid #E0D6C8',
  borderRadius: 11,
  fontFamily: SANS,
  fontSize: 15,
  color: '#3A322A',
  background: '#FBF8F3',
  marginTop: 6,
};

// ─── Дрібні елементи ─────────────────────────────────────────────────────
export const eyebrow: CSSProperties = {
  fontSize: 12,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#9A8C7B',
};

export const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #EFE9DD',
  borderRadius: 18,
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
    background: on ? '#2E2A24' : 'transparent',
    color: on ? '#fff' : '#6E6253',
  };
}

export function selectCard(on: boolean): CSSProperties {
  return {
    textAlign: 'left',
    cursor: 'pointer',
    padding: 18,
    borderRadius: 14,
    border: `1.5px solid ${on ? '#2E2A24' : '#EADFCF'}`,
    background: on ? '#F8F5EF' : '#fff',
    fontFamily: SANS,
    color: '#3A322A',
  };
}
