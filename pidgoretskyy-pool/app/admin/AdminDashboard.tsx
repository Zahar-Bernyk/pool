'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PoolMap from '@/components/PoolMap';
import Toast, { useToast } from '@/components/Toast';
import { createClient } from '@/lib/supabase/client';
import { calcTotal } from '@/lib/pricing';
import { TOTAL_SPOTS } from '@/lib/spots';
import { addDays, fmtDate, todayStr, MONTHS_FULL } from '@/lib/dates';
import type { Booking, Session } from '@/lib/types';
import {
  SERIF,
  SANS,
  primaryBtnFull,
  ghostBtn,
  ghostBtnFull,
  stepBtnSm,
  fieldStyle,
  eyebrow,
  tabStyle,
} from '@/lib/ui';

type Tab = 'dashboard' | 'bookings' | 'calendar' | 'manual' | 'blocked' | 'logins';

const TABS: [Tab, string][] = [
  ['dashboard', 'Огляд'],
  ['bookings', 'Бронювання'],
  ['calendar', 'Календар'],
  ['manual', 'Ручне бронювання'],
  ['blocked', 'Блокування'],
  ['logins', 'Журнал входів'],
];

interface LoginEntry {
  id: string;
  name: string;
  logged_in_at: string;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function sumAmount(list: Booking[]): number {
  return list.reduce((a, b) => a + (b.amount || 0), 0);
}

const MONTHS_LOG = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_LOG[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminDashboard({ email }: { email: string }) {
  const router = useRouter();
  const { message, show } = useToast();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [blockDraft, setBlockDraft] = useState<number[]>([]);
  const [savingBlock, setSavingBlock] = useState(false);
  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);

  // Ручне бронювання
  const [mName, setMName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mDate, setMDate] = useState(todayStr());
  const mSession: Session = 'day'; // ручне бронювання тільки на денний абонемент
  const [mAdults, setMAdults] = useState(1);
  const [mChildren, setMChildren] = useState(0);
  const [mSpots, setMSpots] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [b, bl, lg] = await Promise.all([
        fetch('/api/bookings', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/blocked', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/login-log', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setBookings(b.bookings || []);
      setBlocked(bl.blocked || []);
      setLogins(lg.log || []);
    } catch {
      show('Не вдалося завантажити дані.');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Щойно завантажили/зберегли список — чернетка стає рівною серверному стану.
  useEffect(() => {
    setBlockDraft(blocked);
  }, [blocked]);

  // Чи є незбережені зміни блокування?
  const blockDirty = useMemo(() => {
    const a = [...blocked].sort((x, y) => x - y).join(',');
    const b = [...blockDraft].sort((x, y) => x - y).join(',');
    return a !== b;
  }, [blocked, blockDraft]);

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace('/admin/login');
    router.refresh();
  };

  const today = todayStr();
  const active = useMemo(() => bookings.filter((b) => b.status === 'active'), [bookings]);

  // ── Статистика ────────────────────────────────────────────────────────
  const todayB = active.filter((b) => b.date === today);
  const revToday = sumAmount(todayB);
  const monthB = active.filter((b) => b.date.slice(0, 7) === today.slice(0, 7));
  const revMonth = sumAmount(monthB);
  const occupied = new Set<number>();
  todayB.forEach((b) => b.spots.forEach((s) => occupied.add(s)));

  const statCards = [
    {
      label: 'Бронювань сьогодні',
      value: String(todayB.length),
      sub: `${todayB.reduce((a, b) => a + b.adults + b.children, 0)} гостей`,
      subColor: '#86868B',
    },
    { label: 'Дохід сьогодні', value: `${revToday} ₴`, sub: 'активні', subColor: '#3B9B4E' },
    { label: 'Дохід за місяць', value: `${revMonth} ₴`, sub: `${monthB.length} бронювань`, subColor: '#86868B' },
    { label: 'Зайнятість', value: `${occupied.size}/${TOTAL_SPOTS}`, sub: 'шезлонгів сьогодні', subColor: '#86868B' },
  ];

  // ── Дохід за 7 днів ───────────────────────────────────────────────────
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const ds = addDays(-i);
    const r = sumAmount(active.filter((b) => b.date === ds));
    days7.push({ ds, r });
  }
  const maxR = Math.max(1, ...days7.map((d) => d.r));

  const recent = active.slice(0, 5);

  // ── Доступність для ручного бронювання (рахуємо локально) ─────────────
  const mBooked = useMemo(
    () =>
      active
        .filter((b) => b.date === mDate && b.session === mSession)
        .flatMap((b) => b.spots),
    [active, mDate, mSession]
  );
  const mTotal = calcTotal(mSession, mDate, mAdults, mChildren);

  const adjM = (
    setter: (fn: (v: number) => number) => void,
    delta: number,
    min: number,
    max: number,
    trimSpots = false
  ) => {
    setter((v) => {
      const next = Math.max(min, Math.min(max, v + delta));
      if (trimSpots) setMSpots((sp) => (next < sp.length ? sp.slice(0, next) : sp));
      return next;
    });
  };

  const mSpotClick = (id: number) => {
    setMSpots((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= mAdults) {
        show('Спочатку збільшіть кількість дорослих або зніміть інше місце');
        return cur;
      }
      return [...cur, id];
    });
  };

  const manualSubmit = async () => {
    if (submitting) return;
    if (!mName.trim()) return show('Вкажіть імʼя гостя');
    if (mSpots.length !== mAdults) return show(`Оберіть ${mAdults} шезлонг(и)`);
    setSubmitting(true);
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mName,
          phone: mPhone,
          date: mDate,
          session: mSession,
          adults: mAdults,
          children: mChildren,
          kids110: 0,
          spots: mSpots,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === 'SPOTS_TAKEN') show(`Місця ${(j.spots || []).join(', ')} вже зайняті.`);
        else show(j.message || 'Не вдалося створити бронювання.');
        setSubmitting(false);
        return;
      }
      await reload();
      setMName('');
      setMPhone('');
      setMSpots([]);
      setMAdults(1);
      setMChildren(0);
      setTab('bookings');
      show(`Бронювання ${j.booking.code} створено`);
    } catch {
      show('Помилка мережі.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async (id: string) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)));
    try {
      const r = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' });
      if (!r.ok) throw new Error();
      show('Бронювання скасовано');
    } catch {
      show('Не вдалося скасувати. Оновлюю…');
      reload();
    }
  };

  // ── Блокування місць (через чернетку + кнопку «Зберегти») ─────────────
  // blockDraft — те, що адмін обрав на мапі; застосовується лише після «Зберегти».
  const toggleBlockDraft = (spot: number) => {
    setBlockDraft((prev) => (prev.includes(spot) ? prev.filter((x) => x !== spot) : [...prev, spot]));
  };

  const saveBlocks = async () => {
    if (savingBlock) return;
    setSavingBlock(true);
    try {
      const r = await fetch('/api/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', spots: blockDraft }),
      });
      if (!r.ok) {
        show('Не вдалося зберегти блокування. Спробуйте ще раз.');
        setSavingBlock(false);
        return;
      }
      setBlocked([...blockDraft].sort((a, b) => a - b));
      show('Блокування збережено.');
    } catch {
      show('Помилка мережі. Спробуйте ще раз.');
    } finally {
      setSavingBlock(false);
    }
  };

  const discardBlocks = () => setBlockDraft(blocked);
  const clearBlockDraft = () => setBlockDraft([]);

  // ── Календар ──────────────────────────────────────────────────────────
  const calBase = new Date();
  calBase.setDate(1);
  calBase.setMonth(calBase.getMonth() + monthOffset);
  const mY = calBase.getFullYear();
  const mM = calBase.getMonth();
  const monthLabel = `${MONTHS_FULL[mM]} ${mY}`;
  const startDow = (new Date(mY, mM, 1).getDay() + 6) % 7;
  const dim = new Date(mY, mM + 1, 0).getDate();
  const calendarCells: { day: number | null; count: number; rev: number; isToday: boolean }[] = [];
  for (let i = 0; i < startDow; i++) calendarCells.push({ day: null, count: 0, rev: 0, isToday: false });
  for (let d = 1; d <= dim; d++) {
    const ds = `${mY}-${String(mM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayB = active.filter((b) => b.date === ds);
    calendarCells.push({ day: d, count: dayB.length, rev: sumAmount(dayB), isToday: ds === today });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1D1D1F' }}>
      {/* Шапка */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #D2D2D7',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '14px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, letterSpacing: '.5px' }}>
              Підгорецький Маєток
            </span>
            <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#86868B', marginTop: 2 }}>
              Адмін-панель · Басейн
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 13, color: '#86868B' }} className="admin-email">
              {email}
            </span>
            <button onClick={logout} style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}>
              Вийти
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 22px 70px' }}>
        {/* Вкладки */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 24,
            borderBottom: '1px solid #D2D2D7',
            paddingBottom: 14,
          }}
        >
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tabStyle(tab === k)}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: '#86868B', padding: '40px 0', textAlign: 'center' }}>Завантаження…</div>
        ) : (
          <>
            {/* ─── Огляд ─────────────────────────────────────────────── */}
            {tab === 'dashboard' && (
              <div style={{ animation: 'fadeUp .4s ease' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }} className="stat-grid">
                  {statCards.map((c) => (
                    <div key={c.label} style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 20 }}>
                      <div style={{ ...eyebrow, letterSpacing: 1.5 }}>{c.label}</div>
                      <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, marginTop: 6 }}>{c.value}</div>
                      <div style={{ fontSize: 13, color: c.subColor, marginTop: 2 }}>{c.sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }} className="dash-grid">
                  <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 22 }}>
                    <div style={{ ...eyebrow, letterSpacing: 1.5, marginBottom: 18 }}>Дохід за останні 7 днів</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
                      {days7.map((d) => {
                        const dt = new Date(d.ds + 'T00:00:00');
                        return (
                          <div key={d.ds} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, color: '#6E6E73' }}>{d.r ? d.r : ''}</span>
                            <div
                              style={{
                                width: '100%',
                                height: Math.max(4, Math.round((d.r / maxR) * 130)),
                                background: d.r ? '#1D1D1F' : '#E8E8ED',
                                borderRadius: '6px 6px 0 0',
                              }}
                            />
                            <span style={{ fontSize: 11, color: '#86868B' }}>{WEEKDAYS[(dt.getDay() + 6) % 7]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 22 }}>
                    <div style={{ ...eyebrow, letterSpacing: 1.5, marginBottom: 14 }}>Останні бронювання</div>
                    {recent.length === 0 && <div style={{ color: '#86868B', fontSize: 14 }}>Поки порожньо.</div>}
                    {recent.map((b) => (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #E8E8ED' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{b.name}</div>
                          <div style={{ fontSize: 12, color: '#86868B' }}>{`${fmtDate(b.date)} · ${b.spots.length} місць`}</div>
                        </div>
                        <span style={{ fontWeight: 500, fontSize: 14 }}>{b.amount} ₴</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Бронювання ────────────────────────────────────────── */}
            {tab === 'bookings' && (
              <div style={{ animation: 'fadeUp .4s ease', background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 760 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 1.3fr 1fr 1.1fr 90px 90px 110px',
                        gap: 8,
                        padding: '14px 20px',
                        background: '#F5F5F7',
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: '#86868B',
                      }}
                    >
                      <span>Код</span>
                      <span>Гість</span>
                      <span>Дата</span>
                      <span>Місця</span>
                      <span>Сума</span>
                      <span>Оплата</span>
                      <span></span>
                    </div>
                    {bookings.length === 0 && (
                      <div style={{ padding: 24, color: '#86868B', fontSize: 14 }}>Бронювань ще немає.</div>
                    )}
                    {bookings.map((b) => {
                      const cancelled = b.status !== 'active';
                      const payStyle = {
                        fontSize: 12,
                        padding: '3px 10px',
                        borderRadius: 999,
                        ...(cancelled
                          ? { background: '#F5F5F7', color: '#86868B' }
                          : b.paid
                          ? { background: '#E4F0E6', color: '#3B9B4E' }
                          : { background: '#F5F5F7', color: '#6E6E73' }),
                      } as const;
                      return (
                        <div
                          key={b.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '90px 1.3fr 1fr 1.1fr 90px 90px 110px',
                            gap: 8,
                            padding: '14px 20px',
                            borderBottom: '1px solid #E8E8ED',
                            alignItems: 'center',
                            fontSize: 14,
                            opacity: cancelled ? 0.45 : 1,
                          }}
                        >
                          <span style={{ fontFamily: SERIF, fontWeight: 600 }}>{b.code}</span>
                          <span>
                            <div style={{ fontWeight: 500 }}>{b.name}</div>
                            <div style={{ fontSize: 12, color: '#86868B' }}>{b.phone}</div>
                          </span>
                          <span>
                            {fmtDate(b.date)}
                            <div style={{ fontSize: 12, color: '#86868B' }}>{b.session === 'day' ? 'День' : 'Вечір'}</div>
                          </span>
                          <span style={{ fontSize: 13 }}>{b.spots.slice().sort((a, c) => a - c).join(', ')}</span>
                          <span style={{ fontWeight: 500 }}>{b.amount} ₴</span>
                          <span>
                            <span style={payStyle}>{cancelled ? 'Скасовано' : b.paid ? 'Оплачено' : 'Очікує'}</span>
                          </span>
                          <span>
                            <button
                              onClick={() => !cancelled && cancelBooking(b.id)}
                              disabled={cancelled}
                              style={{
                                fontSize: 13,
                                padding: '6px 12px',
                                borderRadius: 9,
                                border: '1px solid #D2D2D7',
                                background: '#fff',
                                cursor: cancelled ? 'default' : 'pointer',
                                color: cancelled ? '#D2D2D7' : '#C07A6E',
                              }}
                            >
                              {cancelled ? '—' : 'Скасувати'}
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Календар ──────────────────────────────────────────── */}
            {tab === 'calendar' && (
              <div style={{ animation: 'fadeUp .4s ease', background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <button onClick={() => setMonthOffset((m) => m - 1)} style={ghostBtn} aria-label="Попередній місяць">
                    ‹
                  </button>
                  <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600 }}>{monthLabel}</div>
                  <button onClick={() => setMonthOffset((m) => m + 1)} style={ghostBtn} aria-label="Наступний місяць">
                    ›
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                  {WEEKDAYS.map((w) => (
                    <div key={w} style={{ textAlign: 'center', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#86868B', paddingBottom: 6 }}>
                      {w}
                    </div>
                  ))}
                  {calendarCells.map((c, i) =>
                    c.day === null ? (
                      <div key={`e${i}`} style={{ minHeight: 64 }} />
                    ) : (
                      <div
                        key={c.day}
                        style={{
                          minHeight: 64,
                          border: `1px solid ${c.isToday ? '#1D1D1F' : '#E8E8ED'}`,
                          borderRadius: 10,
                          padding: 7,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          background: c.count ? '#F5F5F7' : '#F5F5F7',
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{c.day}</span>
                        {c.count > 0 && (
                          <>
                            <span style={{ fontSize: 11, color: '#6E6E73', fontWeight: 500 }}>{c.count} брон.</span>
                            <span style={{ fontSize: 11, color: '#86868B' }}>{c.rev} ₴</span>
                          </>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ─── Ручне бронювання ──────────────────────────────────── */}
            {tab === 'manual' && (
              <div
                style={{ animation: 'fadeUp .4s ease', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 28, alignItems: 'start' }}
                className="manual-grid"
              >
                <div>
                  <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>Ручне бронювання</h2>
                  <p style={{ color: '#86868B', margin: '0 0 16px', fontSize: 14 }}>
                    Оберіть {mAdults} шезлонг(и) на карті — обрано {mSpots.length}
                  </p>
                  <PoolMap mode="manual" selected={mSpots} booked={mBooked} blocked={blocked} onSpotClick={mSpotClick} />
                </div>
                <div style={{ position: 'sticky', top: 90, background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 22 }} className="manual-form">
                  <label style={{ ...eyebrow, letterSpacing: 1.5 }}>Гість</label>
                  <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Ім'я" style={fieldStyle} />
                  <input value={mPhone} onChange={(e) => setMPhone(e.target.value)} placeholder="Телефон" style={{ ...fieldStyle, marginTop: 10 }} />
                  <label style={{ ...eyebrow, letterSpacing: 1.5, display: 'block', marginTop: 14 }}>Дата</label>
                  <input
                    type="date"
                    value={mDate}
                    min={todayStr()}
                    onChange={(e) => {
                      setMDate(e.target.value);
                      setMSpots([]);
                    }}
                    style={fieldStyle}
                  />
                  <div
                    style={{
                      marginTop: 14,
                      padding: 9,
                      borderRadius: 10,
                      border: '1.5px solid #1D1D1F',
                      background: '#F5F5F7',
                      textAlign: 'center',
                      fontFamily: SANS,
                      fontSize: 14,
                      color: '#1D1D1F',
                    }}
                  >
                    Цілий день · 10:00–20:00
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                    <MiniCounter
                      label="Дорослі"
                      value={mAdults}
                      onMinus={() => adjM(setMAdults as any, -1, 1, 12, true)}
                      onPlus={() => adjM(setMAdults as any, 1, 1, 12, true)}
                    />
                    <MiniCounter
                      label="Діти"
                      value={mChildren}
                      onMinus={() => adjM(setMChildren as any, -1, 0, 12)}
                      onPlus={() => adjM(setMChildren as any, 1, 0, 12)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
                    <span style={{ ...eyebrow, letterSpacing: 1.5 }}>Разом</span>
                    <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600 }}>{mTotal} ₴</span>
                  </div>
                  <button onClick={manualSubmit} disabled={submitting} style={{ ...primaryBtnFull, marginTop: 14 }}>
                    {submitting ? 'Створення…' : 'Створити бронювання'}
                  </button>
                </div>
              </div>
            )}

            {/* ─── Блокування ────────────────────────────────────────── */}
            {tab === 'blocked' && (
              <div
                style={{ animation: 'fadeUp .4s ease', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}
                className="manual-grid"
              >
                <div>
                  <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>Блокування місць</h2>
                  <p style={{ color: '#86868B', margin: '0 0 16px', fontSize: 14 }}>
                    Натисніть на шезлонги, які треба закрити (ремонт / резерв), і збережіть зміни
                  </p>
                  <PoolMap mode="block" selected={[]} booked={[]} blocked={blockDraft} onSpotClick={toggleBlockDraft} />
                </div>
                <div style={{ position: 'sticky', top: 90, background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 22 }} className="manual-form">
                  <div style={{ ...eyebrow, letterSpacing: 1.5, marginBottom: 12 }}>Обрано для блокування</div>
                  <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, minHeight: 38 }}>
                    {blockDraft.length ? blockDraft.slice().sort((a, b) => a - b).join(', ') : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#86868B', marginTop: 6 }}>
                    Заблоковані місця приховані від клієнтів і недоступні для бронювання.
                  </div>

                  {blockDirty && (
                    <div style={{ marginTop: 14, fontSize: 13, color: '#C07A6E', fontWeight: 500 }}>
                      Є незбережені зміни
                    </div>
                  )}

                  <button
                    onClick={saveBlocks}
                    disabled={!blockDirty || savingBlock}
                    style={{
                      ...primaryBtnFull,
                      marginTop: 16,
                      opacity: !blockDirty || savingBlock ? 0.5 : 1,
                      cursor: !blockDirty || savingBlock ? 'default' : 'pointer',
                    }}
                  >
                    {savingBlock ? 'Збереження…' : 'Зберегти зміни'}
                  </button>

                  {blockDirty && (
                    <button onClick={discardBlocks} style={{ ...ghostBtnFull, marginTop: 10 }}>
                      Скасувати зміни
                    </button>
                  )}

                  {blockDraft.length > 0 && (
                    <button onClick={clearBlockDraft} style={{ ...ghostBtnFull, marginTop: 10 }}>
                      Зняти всі блокування
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ─── Журнал входів ─────────────────────────────────────── */}
            {tab === 'logins' && (
              <div style={{ animation: 'fadeUp .4s ease' }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>
                  Журнал входів
                </h2>
                <p style={{ color: '#86868B', margin: '0 0 16px', fontSize: 14 }}>
                  Хто і коли заходив в адмін-панель (імʼя вводиться під час входу)
                </p>
                <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 1fr',
                      gap: 8,
                      padding: '14px 22px',
                      background: '#F5F5F7',
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#86868B',
                    }}
                  >
                    <span>Імʼя та прізвище</span>
                    <span>Дата та час</span>
                  </div>
                  {logins.length === 0 && (
                    <div style={{ padding: 24, color: '#86868B', fontSize: 14 }}>
                      Записів про входи ще немає.
                    </div>
                  )}
                  {logins.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 1fr',
                        gap: 8,
                        padding: '14px 22px',
                        borderBottom: '1px solid #F5F5F7',
                        alignItems: 'center',
                        fontSize: 14,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{l.name}</span>
                      <span style={{ color: '#6E6E73' }}>{fmtDateTime(l.logged_in_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Toast message={message} />

      <style>{`
        @media (max-width: 900px) {
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .manual-grid { grid-template-columns: 1fr !important; }
          .manual-form { position: static !important; }
        }
        @media (max-width: 520px) {
          .stat-grid { grid-template-columns: 1fr !important; }
          .admin-email { display: none; }
        }
      `}</style>
    </div>
  );
}

function MiniCounter({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div style={{ border: '1px solid #E8E8ED', borderRadius: 12, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#86868B' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <button onClick={onMinus} style={stepBtnSm} aria-label={`${label}: менше`}>
          –
        </button>
        <span style={{ fontWeight: 500 }}>{value}</span>
        <button onClick={onPlus} style={stepBtnSm} aria-label={`${label}: більше`}>
          +
        </button>
      </div>
    </div>
  );
}
