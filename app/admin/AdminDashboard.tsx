'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PoolMap from '@/components/PoolMap';
import Toast, { useToast } from '@/components/Toast';
import Closures from '@/components/Closures';
import Scanner from '@/components/Scanner';
import { createClient } from '@/lib/supabase/client';
import { calcTotal } from '@/lib/pricing';
import { addDays, fmtDate, todayStr, MONTHS_FULL } from '@/lib/dates';
import type { Booking, Session, RoomBooking } from '@/lib/types';
import { categoryById, ALL_ROOMS, ROOM_CATEGORIES, ROOM_TO_CATEGORY } from '@/lib/rooms';
import { TOTAL_SPOTS } from '@/lib/spots';
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

type Tab = 'dashboard' | 'bookings' | 'calendar' | 'manual' | 'blocked' | 'closures' | 'logins' | 'reports' | 'scan';

type JobApplication = {
  id: string;
  position: string;
  first_name: string;
  last_name: string;
  age: number | null;
  residence: string;
  experience: string;
  contact: string;
  skills: string;
  resume: string | null;
  status: string;
  created_at: string;
};

// Значення вакансії (як у БД) → підпис українською.
const POSITION_LABELS: Record<string, string> = {
  cook: 'Кухар',
  waiter: 'Офіціант',
  kitchen: 'Кухонний працівник',
  bartender: 'Бармен',
  maid: 'Покоївка',
  cleaner: 'Працівник з прибирання',
};

const TABS: [Tab, string][] = [
  ['dashboard', 'Огляд'],
  ['bookings', 'Бронювання'],
  ['scan', 'Сканер'],
  ['calendar', 'Календар'],
  ['manual', 'Ручне бронювання'],
  ['blocked', 'Блокування'],
  ['closures', 'Закриття днів'],
  ['logins', 'Журнал входів'],
  ['reports', 'Звіти'],
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
  const [section, setSection] = useState<'pool' | 'hotel' | 'vacancies'>('pool');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [reportsUnlocked, setReportsUnlocked] = useState(false);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [detailDay, setDetailDay] = useState<string | null>(null);
  const [bookingsOpen, setBookingsOpen] = useState(true);
  const [switchingOpen, setSwitchingOpen] = useState(false);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [blockBusy, setBlockBusy] = useState(false);
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
      const [b, bl, lg, rb, st, va] = await Promise.all([
        fetch('/api/bookings', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/blocked', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/login-log', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/rooms/bookings', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/booking-status', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/vacancies', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setBookings(b.bookings || []);
      setBlocked(bl.blocked || []);
      setLogins(lg.log || []);
      setRoomBookings(rb.bookings || []);
      setBookingsOpen(st.open !== false);
      setApplications(va.applications || []);
    } catch {
      show('Не вдалося завантажити дані.');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Автооновлення: підтягуємо нові броні кожні 5 хв і коли повертаються на вкладку —
  // щоб не оновлювати сторінку вручну. Оновлюються лише списки; форми не чіпаються.
  useEffect(() => {
    const id = setInterval(() => {
      reload();
    }, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  // Свіжий стан блокувань щоразу при відкритті вкладки «Блокування»
  // (щоб база й адмінка були синхронні перед кліками).
  useEffect(() => {
    if (tab !== 'blocked') return;
    fetch('/api/blocked', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.blocked)) setBlocked(j.blocked.slice().sort((a: number, b: number) => a - b));
      })
      .catch(() => {});
  }, [tab]);

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

  // ── Блокування місць (миттєве; надсилаємо ПОВНИЙ набір для точної синхронізації) ──
  const toggleBlock = async (spot: number) => {
    if (blockBusy) return;
    const wasBlocked = blocked.includes(spot);
    const next = (wasBlocked ? blocked.filter((x) => x !== spot) : [...blocked, spot]).sort((a, b) => a - b);
    const prevBlocked = blocked;
    setBlocked(next); // оптимістично
    setBlockBusy(true);
    try {
      const r = await fetch('/api/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', spots: next }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setBlocked(prevBlocked); // відкат
        show(j?.error ? `Помилка: ${j.error}` : 'Не вдалося зберегти. Спробуйте ще раз.');
      } else {
        if (Array.isArray(j?.blocked)) setBlocked(j.blocked.slice().sort((a: number, b: number) => a - b));
        show(wasBlocked ? `Місце ${spot} розблоковано` : `Місце ${spot} заблоковано`);
      }
    } catch {
      setBlocked(prevBlocked);
      show('Помилка мережі. Спробуйте ще раз.');
    } finally {
      setBlockBusy(false);
    }
  };

  const clearBlocked = async () => {
    if (blockBusy || blocked.length === 0) return;
    const prev = blocked;
    setBlocked([]);
    setBlockBusy(true);
    try {
      const r = await fetch('/api/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (!r.ok) {
        setBlocked(prev);
        show('Не вдалося зняти блокування.');
      } else {
        show('Усі блокування знято.');
      }
    } catch {
      setBlocked(prev);
      show('Помилка мережі.');
    } finally {
      setBlockBusy(false);
    }
  };

  // ── Календар ──────────────────────────────────────────────────────────
  const calBase = new Date();
  calBase.setDate(1);
  calBase.setMonth(calBase.getMonth() + monthOffset);
  const mY = calBase.getFullYear();
  const mM = calBase.getMonth();
  const monthLabel = `${MONTHS_FULL[mM]} ${mY}`;
  const startDow = (new Date(mY, mM, 1).getDay() + 6) % 7;
  const dim = new Date(mY, mM + 1, 0).getDate();
  const calendarCells: { day: number | null; ds: string; count: number; rev: number; isToday: boolean }[] = [];
  for (let i = 0; i < startDow; i++) calendarCells.push({ day: null, ds: '', count: 0, rev: 0, isToday: false });
  for (let d = 1; d <= dim; d++) {
    const ds = `${mY}-${String(mM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayB = active.filter((b) => b.date === ds);
    calendarCells.push({ day: d, ds, count: dayB.length, rev: sumAmount(dayB), isToday: ds === today });
  }

  async function toggleBookings(next: boolean) {
    setSwitchingOpen(true);
    try {
      const res = await fetch('/api/booking-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: next }),
      });
      if (!res.ok) throw new Error();
      setBookingsOpen(next);
      show(next ? 'Бронювання відновлено' : 'Бронювання призупинено на всьому сайті');
    } catch {
      show('Не вдалося змінити статус');
    }
    setSwitchingOpen(false);
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
              Адмін-панель · {section === 'hotel' ? 'Готель' : section === 'vacancies' ? 'Вакансії' : 'Басейн'}
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
        {/* Перемикач розділів */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['pool', 'hotel', 'vacancies'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              style={{
                padding: '10px 24px',
                borderRadius: 100,
                border: `1.5px solid ${section === s ? '#1D1D1F' : '#E8E8ED'}`,
                background: section === s ? '#1D1D1F' : '#fff',
                color: section === s ? '#fff' : '#6E6E73',
                fontFamily: SANS,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s === 'pool' ? 'Басейн' : s === 'hotel' ? 'Готель' : 'Вакансії'}
            </button>
          ))}
        </div>

        {/* ГОЛОВНИЙ ВИМИКАЧ: пауза бронювання (не показуємо в розділі «Вакансії») */}
        {section !== 'vacancies' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            padding: '16px 20px',
            marginBottom: 20,
            borderRadius: 14,
            border: `1.5px solid ${bookingsOpen ? '#E8E8ED' : '#F0C9C9'}`,
            background: bookingsOpen ? '#fff' : '#FDECEC',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: bookingsOpen ? '#3BA55D' : '#D9534F',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>
                {bookingsOpen ? 'Бронювання відкрито' : 'Бронювання призупинено'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#86868B', marginTop: 4 }}>
              {bookingsOpen
                ? 'Сайт приймає бронювання басейну та готелю'
                : 'Гості НЕ можуть бронювати й оплачувати на сайті (басейн і готель)'}
            </div>
          </div>

          <button
            onClick={() => toggleBookings(!bookingsOpen)}
            disabled={switchingOpen}
            style={{
              padding: '12px 24px',
              borderRadius: 100,
              border: 'none',
              background: bookingsOpen ? '#D9534F' : '#1D1D1F',
              color: '#fff',
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: 600,
              cursor: switchingOpen ? 'default' : 'pointer',
              opacity: switchingOpen ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {switchingOpen
              ? '…'
              : bookingsOpen
              ? 'Зупинити всі бронювання'
              : 'Відновити бронювання'}
          </button>
        </div>
        )}

        {/* Вкладки (лише для розділу «Басейн») */}
        {section === 'pool' && (
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
        )}

        {loading ? (
          <div style={{ color: '#86868B', padding: '40px 0', textAlign: 'center' }}>Завантаження…</div>
        ) : section === 'vacancies' ? (
          <VacanciesSection applications={applications} onToast={show} onChanged={reload} />
        ) : section === 'hotel' ? (
          <HotelSection
            roomBookings={roomBookings}
            onToast={show}
            reportsUnlocked={reportsUnlocked}
            onUnlockReports={() => setReportsUnlocked(true)}
          />
        ) : (
          <>
            {/* ─── Огляд ─────────────────────────────────────────────── */}
            {tab === 'dashboard' && (
              <div style={{ animation: 'fadeUp .4s ease' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }} className="stat-grid">
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
                          onClick={() => setDetailBooking(b)}
                          title="Натисніть, щоб побачити деталі"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '90px 1.3fr 1fr 1.1fr 90px 90px 110px',
                            gap: 8,
                            padding: '14px 20px',
                            borderBottom: '1px solid #E8E8ED',
                            alignItems: 'center',
                            fontSize: 14,
                            opacity: cancelled ? 0.45 : 1,
                            cursor: 'pointer',
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
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!cancelled) cancelBooking(b.id);
                              }}
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
                        onClick={() => c.count > 0 && setDetailDay(c.ds)}
                        title={c.count > 0 ? 'Натисніть, щоб побачити бронювання цього дня' : ''}
                        style={{
                          minHeight: 64,
                          border: `1px solid ${c.isToday ? '#1D1D1F' : '#E8E8ED'}`,
                          borderRadius: 10,
                          padding: 7,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          background: c.count ? '#EFEFF2' : '#F5F5F7',
                          cursor: c.count > 0 ? 'pointer' : 'default',
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
                    Натисніть на шезлонг, щоб закрити його (ремонт / резерв). Зміни зберігаються одразу.
                  </p>
                  <PoolMap mode="block" selected={[]} booked={[]} blocked={blocked} onSpotClick={toggleBlock} />
                </div>
                <div style={{ position: 'sticky', top: 90, background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 22 }} className="manual-form">
                  <div style={{ ...eyebrow, letterSpacing: 1.5, marginBottom: 12 }}>Заблоковано зараз</div>
                  <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, minHeight: 38 }}>
                    {blocked.length ? blocked.slice().sort((a, b) => a - b).join(', ') : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#86868B', marginTop: 6 }}>
                    Заблоковані місця приховані від клієнтів і недоступні для бронювання. Клік по місцю одразу зберігається.
                  </div>

                  {blocked.length > 0 && (
                    <button onClick={clearBlocked} disabled={blockBusy} style={{ ...ghostBtnFull, marginTop: 18 }}>
                      Розблокувати всі
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ─── Закриття днів (басейн) ────────────────────────────── */}
            {tab === 'closures' && (
              <div style={{ animation: 'fadeUp .4s ease' }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>
                  Закриття днів
                </h2>
                <p style={{ color: '#86868B', margin: '0 0 20px', fontSize: 14 }}>
                  Закрийте басейн на один день або період — гості не зможуть бронювати ці дати
                </p>
                <Closures kind="pool" onToast={show} />
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

            {/* ─── Звіти (під окремим паролем) ─────────────────────────── */}
            {tab === 'scan' && <Scanner onToast={show} />}

            {tab === 'reports' && (
              <div style={{ animation: 'fadeUp .4s ease' }}>
                {reportsUnlocked ? (
                  <RevenueReport
                    title="Звіт — Басейн"
                    items={bookings.map((b) => ({ amount: b.amount || 0, dateKey: b.date }))}
                  />
                ) : (
                  <ReportsGate onUnlock={() => setReportsUnlocked(true)} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {detailBooking && (
        <PoolBookingDetail
          b={detailBooking}
          onClose={() => setDetailBooking(null)}
          onCancel={(id) => {
            cancelBooking(id);
            setDetailBooking(null);
          }}
        />
      )}

      {detailDay && (
        <Modal
          title={fmtDate(detailDay)}
          subtitle={`${active.filter((b) => b.date === detailDay).length} бронювань · ${sumAmount(
            active.filter((b) => b.date === detailDay)
          )} ₴`}
          onClose={() => setDetailDay(null)}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {active
              .filter((b) => b.date === detailDay)
              .map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    setDetailBooking(b);
                    setDetailDay(null);
                  }}
                  style={{
                    border: '1px solid #E8E8ED',
                    borderRadius: 12,
                    padding: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: SERIF, fontWeight: 600 }}>{b.code}</div>
                    <div style={{ fontSize: 13, color: '#6E6E73' }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: '#A0A0A5' }}>
                      Місця: {b.spots.slice().sort((x, y) => x - y).join(', ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{b.amount} ₴</div>
                    <StatusPill cancelled={b.status !== 'active'} paid={b.paid} />
                  </div>
                </div>
              ))}
          </div>
        </Modal>
      )}

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

// ── Модальні картки з повною інформацією ──────────────────────────────────
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.38)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: 24,
          animation: 'fadeUp .22s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, margin: 0 }}>{title}</h3>
            {subtitle ? <div style={{ fontSize: 13, color: '#86868B', marginTop: 2 }}>{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити"
            style={{
              border: 'none',
              background: '#F5F5F7',
              width: 32,
              height: 32,
              minWidth: 32,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              color: '#6E6E73',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 1fr',
        gap: 12,
        padding: '11px 0',
        borderTop: '1px solid #F0F0F2',
        fontSize: 14,
        alignItems: 'baseline',
      }}
    >
      <span style={{ color: '#A0A0A5', fontSize: 13 }}>{label}</span>
      <span style={{ wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function StatusPill({ cancelled, paid }: { cancelled: boolean; paid: boolean }) {
  const s = cancelled
    ? { bg: '#F5F5F7', c: '#86868B', t: 'Скасовано' }
    : paid
    ? { bg: '#E4F0E6', c: '#3B9B4E', t: 'Оплачено' }
    : { bg: '#FDF3E4', c: '#B7791F', t: 'Очікує оплати' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 999,
        background: s.bg,
        color: s.c,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {s.t}
    </span>
  );
}

function PoolBookingDetail({
  b,
  onClose,
  onCancel,
}: {
  b: Booking;
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  const cancelled = b.status !== 'active';
  return (
    <Modal
      title={b.code}
      subtitle={`${fmtDate(b.date)} · ${b.session === 'day' ? 'Цілий день' : 'Вечір'}`}
      onClose={onClose}
    >
      <div style={{ marginBottom: 6 }}>
        <StatusPill cancelled={cancelled} paid={b.paid} />
      </div>
      <DetailRow label="Гість" value={b.name} />
      <DetailRow
        label="Телефон"
        value={b.phone ? <a href={`tel:${b.phone}`} style={{ color: '#1D1D1F' }}>{b.phone}</a> : '—'}
      />
      <DetailRow label="Місця" value={b.spots.slice().sort((x, y) => x - y).join(', ') || '—'} />
      <DetailRow
        label="Гості"
        value={`${b.adults} дор.${b.children ? ` · ${b.children} діт.` : ''}${
          b.kids110 ? ` · ${b.kids110} до 110 см` : ''
        }`}
      />
      <DetailRow label="Сума" value={<strong>{b.amount} ₴</strong>} />
      {b.created_at ? <DetailRow label="Створено" value={fmtDateTime(b.created_at)} /> : null}
      {!cancelled && (
        <button
          onClick={() => onCancel(b.id)}
          style={{
            marginTop: 18,
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #F0C9C9',
            background: '#FDECEC',
            color: '#D9534F',
            fontFamily: SANS,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Скасувати бронювання
        </button>
      )}
    </Modal>
  );
}

function RoomBookingDetail({ b, onClose }: { b: RoomBooking; onClose: () => void }) {
  const cat = categoryById(b.category);
  const cancelled = b.status !== 'active';
  return (
    <Modal title={b.code} subtitle={`${fmtDateHB(b.check_in)} → ${fmtDateHB(b.check_out)}`} onClose={onClose}>
      <div style={{ marginBottom: 6 }}>
        <StatusPill cancelled={cancelled} paid={b.paid} />
      </div>
      <DetailRow label="Гість" value={b.name} />
      <DetailRow
        label="Телефон"
        value={b.phone ? <a href={`tel:${b.phone}`} style={{ color: '#1D1D1F' }}>{b.phone}</a> : '—'}
      />
      <DetailRow label="Номер" value={`№${b.room} · ${cat ? cat.title : b.category}`} />
      <DetailRow label="Ночей" value={`${b.nights} ${nightsWordHB(b.nights)}`} />
      <DetailRow
        label="Гості"
        value={`${b.guests} гост.${b.extra_bed ? ' · дод. ліжко' : ''}`}
      />
      <DetailRow label="Сума" value={<strong>{b.amount} ₴</strong>} />
      {b.created_at ? <DetailRow label="Створено" value={fmtDateTime(b.created_at)} /> : null}
    </Modal>
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

// ── Розділ «Готель»: перегляд усіх бронювань номерів ──────────────────────
const MONTHS_HB = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
function fmtDateHB(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_HB[m - 1]} ${y}`;
}
function nightsWordHB(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'ніч';
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'ночі';
  return 'ночей';
}

function HotelBookings({
  roomBookings,
  onSelect,
}: {
  roomBookings: RoomBooking[];
  onSelect: (b: RoomBooking) => void;
}) {
  const totalRevenue = roomBookings.reduce((s, b) => s + (b.amount || 0), 0);

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: '0 0 4px' }}>Бронювання номерів</h2>
      <p style={{ color: '#86868B', margin: '0 0 20px', fontSize: 14 }}>
        Усі підтверджені (оплачені) бронювання готелю · всього {roomBookings.length} · дохід {totalRevenue} грн
      </p>

      {roomBookings.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 40, textAlign: 'center', color: '#86868B' }}>
          Ще немає оплачених бронювань номерів.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1.4fr 1.4fr 1fr 1fr 90px',
              gap: 10,
              padding: '14px 22px',
              background: '#F5F5F7',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#86868B',
            }}
            className="hb-head"
          >
            <span>Код</span>
            <span>Гість</span>
            <span>Номер</span>
            <span>Заїзд → виїзд</span>
            <span>Ночей</span>
            <span style={{ textAlign: 'right' }}>Сума</span>
          </div>
          {roomBookings.map((b) => {
            const cat = categoryById(b.category);
            return (
              <div
                key={b.id}
                className="hb-row"
                onClick={() => onSelect(b)}
                title="Натисніть, щоб побачити деталі"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1.4fr 1.4fr 1fr 1fr 90px',
                  gap: 10,
                  padding: '14px 22px',
                  borderBottom: '1px solid #F5F5F7',
                  alignItems: 'center',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: SERIF, fontWeight: 600 }}>{b.code}</span>
                <span>
                  <span style={{ fontWeight: 500, display: 'block' }}>{b.name}</span>
                  <span style={{ fontSize: 12, color: '#86868B' }}>{b.phone}</span>
                </span>
                <span>
                  <span style={{ display: 'block' }}>{cat ? cat.title : b.category}</span>
                  <span style={{ fontSize: 12, color: '#86868B' }}>
                    №{b.room}
                    {b.extra_bed ? ' · дод. ліжко' : ''}
                    {b.guests ? ` · ${b.guests} гост.` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 13 }}>
                  {fmtDateHB(b.check_in)} → {fmtDateHB(b.check_out)}
                </span>
                <span style={{ fontSize: 13 }}>
                  {b.nights} {nightsWordHB(b.nights)}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{b.amount} ₴</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Розділ «Готель»: Огляд / Бронювання / Календар зайнятості ─────────────
const WD_HB = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
function padHB(n: number) {
  return String(n).padStart(2, '0');
}
function todayStrHB(): string {
  const d = new Date();
  return `${d.getFullYear()}-${padHB(d.getMonth() + 1)}-${padHB(d.getDate())}`;
}
function addDaysStrHB(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${padHB(d.getMonth() + 1)}-${padHB(d.getDate())}`;
}

const CAL_DAYS = 14;

// ── Розділ «Вакансії»: заявки кандидатів із сайту ─────────────────────────
function AppRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'start' }}>
      <span style={{ color: '#A0A0A5', fontSize: 13 }}>{label}</span>
      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function VacanciesSection({
  applications,
  onToast,
  onChanged,
}: {
  applications: JobApplication[];
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm('Видалити цю заявку?')) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/vacancies?id=${id}`, { method: 'DELETE' });
      if (!r.ok) {
        onToast('Не вдалося видалити заявку.');
        setDeleting(null);
        return;
      }
      onToast('Заявку видалено.');
      onChanged();
    } catch {
      onToast('Помилка мережі.');
      setDeleting(null);
    }
  }

  if (applications.length === 0) {
    return (
      <div style={{ animation: 'fadeUp .4s ease', color: '#86868B', padding: '40px 0', textAlign: 'center' }}>
        Заявок ще немає. Щойно хтось надішле форму з розділу «Вакансії» на сайті — вони зʼявляться тут.
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, margin: 0 }}>Заявки на вакансії</h2>
        <span style={{ fontSize: 13, color: '#86868B' }}>Усього: {applications.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {applications.map((a) => (
          <div key={a.id} style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 100,
                    background: '#1D1D1F',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  {POSITION_LABELS[a.position] || a.position}
                </span>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600 }}>
                  {a.first_name} {a.last_name}
                  {a.age ? (
                    <span style={{ fontFamily: SANS, fontSize: 15, color: '#86868B', fontWeight: 400 }}>, {a.age} р.</span>
                  ) : null}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#A0A0A5', whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 14, color: '#3A3A3C' }}>
              <AppRow label="Контакти" value={a.contact} />
              <AppRow label="Проживання" value={a.residence} />
              <AppRow label="Досвід" value={a.experience} />
              <AppRow label="Навички" value={a.skills} />
              {a.resume ? <AppRow label="Резюме" value={a.resume} /> : null}
            </div>

            <button
              onClick={() => remove(a.id)}
              disabled={deleting === a.id}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                borderRadius: 100,
                border: '1px solid #F0C9C9',
                background: '#FDECEC',
                color: '#D9534F',
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 600,
                cursor: deleting === a.id ? 'default' : 'pointer',
              }}
            >
              {deleting === a.id ? '…' : 'Видалити'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Розділ «Звіти»: доступ під окремим паролем + зведення доходу ──────────
function ReportsGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pw === '20052005') onUnlock();
    else setErr(true);
  };
  return (
    <div style={{ maxWidth: 380, margin: '48px auto', textAlign: 'center', animation: 'fadeUp .4s ease' }}>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, marginBottom: 6 }}>Розділ «Звіти»</div>
      <p style={{ fontSize: 14, color: '#86868B', marginBottom: 20 }}>Доступ до фінансових звітів захищено окремим паролем.</p>
      <input
        type="password"
        value={pw}
        onChange={(e) => {
          setPw(e.target.value);
          setErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Пароль"
        style={{ ...fieldStyle, textAlign: 'center', letterSpacing: 2 }}
        autoFocus
      />
      {err && <div style={{ color: '#D9534F', fontSize: 13, marginTop: 8 }}>Невірний пароль.</div>}
      <button onClick={submit} style={{ ...primaryBtnFull, marginTop: 14 }}>
        Відкрити
      </button>
    </div>
  );
}

function RevenueReport({ title, items }: { title: string; items: { amount: number; dateKey: string }[] }) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonthKey = `${curYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const total = items.reduce((s, b) => s + b.amount, 0);
  const thisYear = items.filter((b) => b.dateKey.slice(0, 4) === String(curYear)).reduce((s, b) => s + b.amount, 0);
  const thisMonth = items.filter((b) => b.dateKey.slice(0, 7) === curMonthKey).reduce((s, b) => s + b.amount, 0);

  const rows = MONTHS_FULL.map((name, i) => {
    const mk = `${curYear}-${String(i + 1).padStart(2, '0')}`;
    const mItems = items.filter((b) => b.dateKey.slice(0, 7) === mk);
    return { name, sum: mItems.reduce((s, b) => s + b.amount, 0), count: mItems.length };
  }).filter((r) => r.count > 0);

  const cardStyle = { background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 20 } as const;

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, margin: '0 0 16px' }}>{title}</h2>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}
        className="stat-grid"
      >
        <div style={cardStyle}>
          <div style={{ ...eyebrow, letterSpacing: 1.5 }}>Цей місяць</div>
          <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{thisMonth} ₴</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...eyebrow, letterSpacing: 1.5 }}>Цей рік</div>
          <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{thisYear} ₴</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...eyebrow, letterSpacing: 1.5 }}>За весь час</div>
          <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, marginTop: 6 }}>{total} ₴</div>
        </div>
      </div>

      <h3 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>По місяцях · {curYear}</h3>
      {rows.length === 0 ? (
        <div style={{ color: '#86868B', padding: '20px 0' }}>Даних за цей рік ще немає.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
          {rows.map((r, idx) => (
            <div
              key={r.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 20px',
                borderTop: idx === 0 ? 'none' : '1px solid #F0F0F2',
              }}
            >
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: '#A0A0A5' }}>{r.count} бронювань</span>
                <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600 }}>{r.sum} ₴</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HotelSection({
  roomBookings,
  onToast,
  reportsUnlocked,
  onUnlockReports,
}: {
  roomBookings: RoomBooking[];
  onToast: (m: string) => void;
  reportsUnlocked: boolean;
  onUnlockReports: () => void;
}) {
  const [hotelTab, setHotelTab] = useState<'overview' | 'bookings' | 'calendar' | 'closures' | 'reports'>('overview');
  const [detailRB, setDetailRB] = useState<RoomBooking | null>(null);
  const [calStart, setCalStart] = useState<string>(todayStrHB());

  const today = todayStrHB();
  const active = roomBookings;

  // KPI
  const revenue = active.reduce((s, b) => s + (b.amount || 0), 0);
  const checkinsToday = active.filter((b) => b.check_in === today).length;
  const occupiedToday = new Set(
    active.filter((b) => b.check_in <= today && today < b.check_out).map((b) => b.room)
  ).size;
  const upcoming = active.filter((b) => b.check_in >= today).length;

  const kpis = [
    { label: 'Активні бронювання', value: String(active.length) },
    { label: 'Зайнято сьогодні', value: `${occupiedToday}/${ALL_ROOMS.length}`, sub: 'номерів' },
    { label: 'Заїзди сьогодні', value: String(checkinsToday) },
    { label: 'Майбутні', value: String(upcoming), sub: 'заїздів' },
  ];

  // Календар: дні вікна
  const days: string[] = [];
  for (let i = 0; i < CAL_DAYS; i++) days.push(addDaysStrHB(calStart, i));

  // Пошук бронювання, що покриває конкретний номер+дату
  const bookingAt = (room: number, day: string) =>
    active.find((b) => b.room === room && b.check_in <= day && day < b.check_out);

  const tabBtn = (k: 'overview' | 'bookings' | 'calendar' | 'closures' | 'reports', label: string) => (
    <button
      key={k}
      onClick={() => setHotelTab(k)}
      style={{
        padding: '9px 18px',
        borderRadius: 100,
        border: 'none',
        background: hotelTab === k ? '#1D1D1F' : 'transparent',
        color: hotelTab === k ? '#fff' : '#6E6E73',
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #D2D2D7', paddingBottom: 14, flexWrap: 'wrap' }}>
        {tabBtn('overview', 'Огляд')}
        {tabBtn('bookings', 'Бронювання')}
        {tabBtn('calendar', 'Календар')}
        {tabBtn('closures', 'Закриття номерів')}
        {tabBtn('reports', 'Звіти')}
      </div>

      {hotelTab === 'overview' && (
        <div style={{ animation: 'fadeUp .3s ease' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#86868B', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 12, color: '#86868B', marginTop: 2 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: '0 0 12px' }}>Найближчі заїзди</h3>
          {active.filter((b) => b.check_in >= today).sort((a, b) => a.check_in.localeCompare(b.check_in)).slice(0, 6).length === 0 ? (
            <div style={{ color: '#86868B', fontSize: 14 }}>Немає майбутніх заїздів.</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
              {active
                .filter((b) => b.check_in >= today)
                .sort((a, b) => a.check_in.localeCompare(b.check_in))
                .slice(0, 6)
                .map((b) => {
                  const cat = categoryById(b.category);
                  return (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid #F5F5F7', fontSize: 14 }}>
                      <span>
                        <span style={{ fontWeight: 500 }}>{b.name}</span>
                        <span style={{ color: '#86868B', marginLeft: 8, fontSize: 13 }}>{cat?.title || ''} · №{b.room}</span>
                      </span>
                      <span style={{ color: '#6E6E73', fontSize: 13 }}>
                        {fmtDateHB(b.check_in)} → {fmtDateHB(b.check_out)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {hotelTab === 'bookings' && <HotelBookings roomBookings={roomBookings} onSelect={setDetailRB} />}

      {hotelTab === 'closures' && <Closures kind="rooms" onToast={onToast} />}

      {hotelTab === 'reports' && (
        <div style={{ animation: 'fadeUp .4s ease' }}>
          {reportsUnlocked ? (
            <RevenueReport
              title="Звіт — Готель"
              items={roomBookings.map((b) => ({ amount: b.amount || 0, dateKey: b.check_in }))}
            />
          ) : (
            <ReportsGate onUnlock={onUnlockReports} />
          )}
        </div>
      )}

      {hotelTab === 'calendar' && (
        <div style={{ animation: 'fadeUp .3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 24, margin: 0 }}>Календар зайнятості</h2>
              <p style={{ color: '#86868B', margin: '2px 0 0', fontSize: 13 }}>
                {fmtDateHB(days[0])} → {fmtDateHB(days[days.length - 1])}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCalStart(addDaysStrHB(calStart, -CAL_DAYS))} style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}>← Раніше</button>
              <button onClick={() => setCalStart(today)} style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}>Сьогодні</button>
              <button onClick={() => setCalStart(addDaysStrHB(calStart, CAL_DAYS))} style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}>Пізніше →</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #E8E8ED', borderRadius: 14, background: '#fff' }}>
            <div style={{ minWidth: 140 + CAL_DAYS * 46 }}>
              {/* Заголовок днів */}
              <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${CAL_DAYS}, 1fr)`, borderBottom: '1px solid #E8E8ED', position: 'sticky', top: 0, background: '#F5F5F7' }}>
                <div style={{ padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#86868B' }}>Номер</div>
                {days.map((d) => {
                  const dt = new Date(d + 'T00:00:00');
                  const isToday = d === today;
                  const wend = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <div key={d} style={{ padding: '8px 2px', textAlign: 'center', borderLeft: '1px solid #EDEDF0', background: isToday ? '#EAF3EC' : wend ? '#FAFAFB' : 'transparent' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? '#2E7E5E' : '#1D1D1F' }}>{dt.getDate()}</div>
                      <div style={{ fontSize: 10, color: '#86868B' }}>{WD_HB[dt.getDay()]}</div>
                    </div>
                  );
                })}
              </div>

              {/* Рядки номерів */}
              {ALL_ROOMS.map((room) => {
                const cat = ROOM_TO_CATEGORY[room];
                return (
                  <div key={room} style={{ display: 'grid', gridTemplateColumns: `140px repeat(${CAL_DAYS}, 1fr)`, borderBottom: '1px solid #F5F5F7' }}>
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 15 }}>№{room}</span>
                      <span style={{ fontSize: 10.5, color: '#86868B', lineHeight: 1.1 }}>{cat?.title || ''}</span>
                    </div>
                    {days.map((d) => {
                      const b = bookingAt(room, d);
                      const isStart = b && b.check_in === d;
                      const isToday = d === today;
                      return (
                        <div
                          key={d}
                          onClick={() => b && setDetailRB(b)}
                          title={b ? `${b.code} · ${b.name} — натисніть для деталей` : ''}
                          style={{
                            borderLeft: '1px solid #F0F0F2',
                            background: b ? '#1D1D1F' : isToday ? '#EAF3EC' : '#fff',
                            minHeight: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: '#fff',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            cursor: b ? 'pointer' : 'default',
                          }}
                        >
                          {isStart ? (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '0 2px' }}>{b!.name.split(' ')[0]}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12, color: '#86868B', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, background: '#1D1D1F', borderRadius: 3, display: 'inline-block' }} /> Зайнято</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, background: '#EAF3EC', border: '1px solid #C5E3CE', borderRadius: 3, display: 'inline-block' }} /> Сьогодні</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, background: '#fff', border: '1px solid #E8E8ED', borderRadius: 3, display: 'inline-block' }} /> Вільно</span>
          </div>
        </div>
      )}

      {detailRB && <RoomBookingDetail b={detailRB} onClose={() => setDetailRB(null)} />}
    </div>
  );
}
