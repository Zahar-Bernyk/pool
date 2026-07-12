'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PoolMap from '@/components/PoolMap';
import SiteHeader from '@/components/SiteHeader';
import { useBookingsOpen, PausedBanner } from '@/components/BookingStatus';
import Toast, { useToast } from '@/components/Toast';
import { calcTotal, isWeekend, unitPrice } from '@/lib/pricing';
import { fmtDate, todayStr } from '@/lib/dates';
import type { Booking, Session } from '@/lib/types';
import {
  SERIF,
  SANS,
  primaryBtn,
  primaryBtnFull,
  ghostBtn,
  ghostBtnFull,
  stepBtn,
  fieldStyle,
  eyebrow,
  card,
  selectCard,
} from '@/lib/ui';

type Step = 'tariff' | 'map' | 'details' | 'payment' | 'confirm';

const STEP_ORDER: Step[] = ['tariff', 'map', 'details', 'payment'];
const STEP_LABELS: Record<Step, string> = {
  tariff: 'Тариф',
  map: 'Місце',
  details: 'Дані',
  payment: 'Оплата',
  confirm: 'Оплата',
};

// Гарна дата українською: "6 липня 2026"
const MONTHS_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
function fmtDateNice(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}
// Індексація за getDay(): 0 = неділя
const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Перевірка українського номера: 0XXXXXXXXX (10 цифр) або 380XXXXXXXXX (12 цифр).
function isValidPhone(raw: string): boolean {
  const d = (raw || '').replace(/\D/g, '');
  return (d.length === 10 && d.startsWith('0')) || (d.length === 12 && d.startsWith('380'));
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#FFFFFF' }} />}>
      <BookingInner />
    </Suspense>
  );
}

function BookingInner() {
  const params = useSearchParams();
  const { message, show } = useToast();
  const { open: bookingsOpen } = useBookingsOpen();

  const [step, setStep] = useState<Step>('tariff');
  const session: Session = 'day'; // вечірнє прибрано з бронювання (тільки денний абонемент)
  const [date, setDate] = useState<string>(todayStr());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [kids110, setKids110] = useState(0);
  const [selectedSpots, setSelectedSpots] = useState<number[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const [booked, setBooked] = useState<number[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [closed, setClosed] = useState(false);
  const [closedNote, setClosedNote] = useState<string | null>(null);

  const wknd = isWeekend(date);
  const total = useMemo(
    () => calcTotal(session, date, adults, children),
    [session, date, adults, children]
  );

  // ── Доступність місць для обраного слоту ──────────────────────────────
  const loadAvailability = useCallback(async (d: string, s: Session) => {
    try {
      const r = await fetch(`/api/availability?date=${d}&session=${s}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setBooked(j.booked || []);
      setBlocked(j.blocked || []);
      setClosed(Boolean(j.closed));
      setClosedNote(j.closedNote || null);
    } catch {
      /* мережа — лишаємо попередні дані */
    }
  }, []);

  useEffect(() => {
    loadAvailability(date, session);
  }, [date, session, loadAvailability]);

  // ── Повернення з LiqPay (?paid=PM-####) ───────────────────────────────
  useEffect(() => {
    const code = params.get('paid');
    if (!code) return;
    let stop = false;
    const poll = async (attempt = 0) => {
      try {
        const r = await fetch(`/api/payment/status?code=${code}`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (!stop && j.booking?.paid) {
            setConfirmed(j.booking);
            setStep('confirm');
            return;
          }
        }
      } catch {
        /* ignore */
      }
      if (!stop && attempt < 8) setTimeout(() => poll(attempt + 1), 1500);
    };
    poll();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Степери (зменшення дорослих обрізає вибір місць) ──────────────────
  const adjAdults = (delta: number) =>
    setAdults((v) => {
      const next = Math.max(1, Math.min(12, v + delta));
      setSelectedSpots((sp) => (next < sp.length ? sp.slice(0, next) : sp));
      return next;
    });

  const spotClick = (id: number) => {
    setSelectedSpots((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= adults) {
        show('Спочатку зменшіть кількість дорослих або зніміть інше місце');
        return cur;
      }
      return [...cur, id];
    });
  };

  const changeDate = (d: string) => {
    setDate(d);
    setSelectedSpots([]); // доступність змінилась
  };

  const summaryRows = [
    { k: 'Дата', v: fmtDate(date) },
    { k: 'Сеанс', v: session === 'day' ? 'Цілий день · 10–20' : 'Вечірнє · 17–20' },
    {
      k: 'Гостей',
      v: `${adults} дор.${children ? ' · ' + children + ' діт.' : ''}${
        kids110 ? ' · ' + kids110 + ' малюк' : ''
      }`,
    },
    {
      k: 'Шезлонги',
      v: selectedSpots.length
        ? selectedSpots.slice().sort((a, b) => a - b).join(', ')
        : '—',
    },
  ];

  // ── Оплата ────────────────────────────────────────────────────────────
  const doPay = async () => {
    if (paying) return;
    setPaying(true);
    try {
      const r = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${firstName.trim()} ${lastName.trim()}`.trim(), phone, date, session, adults, children, kids110, spots: selectedSpots }),
      });
      const j = await r.json();

      if (!r.ok) {
        setPaying(false);
        if (j.error === 'SPOTS_TAKEN') {
          show(`Місця ${(j.spots || []).join(', ')} щойно зайняли. Оберіть інші.`);
          await loadAvailability(date, session);
          setSelectedSpots((sp) => sp.filter((x) => !(j.spots || []).includes(x)));
          setStep('map');
        } else {
          show(j.message || 'Не вдалося створити бронювання.');
        }
        return;
      }

      if (j.mode === 'liqpay') {
        // Автосабміт у checkout LiqPay
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://www.liqpay.ua/api/3/checkout';
        form.acceptCharset = 'utf-8';
        const add = (n: string, v: string) => {
          const i = document.createElement('input');
          i.type = 'hidden';
          i.name = n;
          i.value = v;
          form.appendChild(i);
        };
        add('data', j.data);
        add('signature', j.signature);
        document.body.appendChild(form);
        form.submit();
        return;
      }

      // Демо-режим — одразу підтвердження
      setConfirmed(j.booking);
      setStep('confirm');
      setPaying(false);
    } catch {
      setPaying(false);
      show('Помилка мережі. Спробуйте ще раз.');
    }
  };

  const resetClient = () => {
    setStep('tariff');
    setSelectedSpots([]);
    setFirstName('');
    setLastName('');
    setPhone('');
    setAdults(2);
    setChildren(0);
    setKids110(0);
    setConfirmed(null);
  };

  // ── Індикатор кроків ──────────────────────────────────────────────────
  const curIdx = STEP_ORDER.indexOf(step === 'confirm' ? 'payment' : step);

  const confTotal = confirmed?.amount ?? total;
  const confRows = confirmed
    ? [
        { k: 'Дата', v: fmtDate(confirmed.date) },
        { k: 'Сеанс', v: confirmed.session === 'day' ? 'Цілий день · 10–20' : 'Вечірнє · 17–20' },
        {
          k: 'Гостей',
          v: `${confirmed.adults} дор.${confirmed.children ? ' · ' + confirmed.children + ' діт.' : ''}`,
        },
        { k: 'Шезлонги', v: confirmed.spots.slice().sort((a, b) => a - b).join(', ') },
      ]
    : summaryRows;

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1D1D1F' }}>
      <SiteHeader subtitle="Басейн · Онлайн бронювання" />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 22px 70px' }}>
        {!bookingsOpen && <PausedBanner />}
        {bookingsOpen && (
        <>
        {/* Кроки */}
        <div
          className="steps-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 30,
          }}
        >
          {STEP_ORDER.map((k, i) => {
            const done = i < curIdx || step === 'confirm';
            const active = i === curIdx && step !== 'confirm';
            const filled = done || active;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 500,
                      background: filled ? '#1D1D1F' : '#E8E8ED',
                      color: filled ? '#fff' : '#86868B',
                    }}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={`step-label ${i === curIdx ? 'step-label-on' : 'step-label-off'}`}
                    style={{
                      fontSize: 13,
                      color: filled ? '#1D1D1F' : '#86868B',
                      fontWeight: filled ? 500 : 400,
                    }}
                  >
                    {STEP_LABELS[k]}
                  </span>
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div className="step-conn" style={{ width: 30, height: 1.5, background: done ? '#1D1D1F' : '#E8E8ED' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ─── КРОК 1: Тариф ─────────────────────────────────────────── */}
        {step === 'tariff' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 760, margin: '0 auto' }}>
            <h1
              style={{
                fontFamily: SERIF,
                fontWeight: 500,
                fontSize: 38,
                textAlign: 'center',
                margin: '0 0 6px',
              }}
            >
              Оберіть тариф
            </h1>
            <p style={{ textAlign: 'center', color: '#86868B', margin: '0 0 30px', fontSize: 15 }}>
              Дорослий абонемент включає шезлонг біля басейну
            </p>

            <div style={card}>
              <div style={{ ...eyebrow, marginBottom: 12 }}>Дата візиту</div>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: '100%',
                    padding: '15px 16px',
                    border: '1px solid #D2D2D7',
                    borderRadius: 12,
                    fontFamily: SANS,
                    fontSize: 16,
                    color: '#1D1D1F',
                    background: '#F5F5F7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span>{fmtDateNice(date)}</span>
                  <span style={{ fontSize: 13, color: wknd ? '#6E6E73' : '#86868B', flexShrink: 0 }}>
                    {WEEKDAYS_SHORT[new Date(date + 'T00:00:00').getDay()]}
                    {wknd ? ' · вихідний' : ' · будній'}
                  </span>
                </div>
                <input
                  type="date"
                  value={date}
                  min={todayStr()}
                  onChange={(e) => e.target.value && changeDate(e.target.value)}
                  aria-label="Оберіть дату візиту"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                  }}
                />
              </div>

              <div style={{ ...eyebrow, margin: '24px 0 12px' }}>Сеанс</div>
              <div style={{ ...selectCard(true), cursor: 'default' }}>
                <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600 }}>Цілий день</div>
                <div style={{ fontSize: 13, color: '#86868B', marginTop: 2 }}>10:00 – 20:00</div>
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 500 }}>
                  {unitPrice('day', wknd, 'adult')} грн{' '}
                  <span style={{ color: '#86868B', fontWeight: 400 }}>/ дорослий</span>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: '#86868B', lineHeight: 1.5 }}>
                Вечірнє плавання (17:00–20:00) — без попереднього бронювання, за
                наявності вільних місць на місці.
              </div>

              <div
                className="counters-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 14,
                  marginTop: 24,
                }}
              >
                <Counter
                  title="Дорослі"
                  hint="+ шезлонг кожному"
                  hintColor="#86868B"
                  value={adults}
                  onMinus={() => adjAdults(-1)}
                  onPlus={() => adjAdults(1)}
                />
                <Counter
                  title="Діти до 12"
                  hint={`${unitPrice(session, wknd, 'child')} грн · без шезлонга`}
                  hintColor="#86868B"
                  value={children}
                  onMinus={() => setChildren((v) => Math.max(0, v - 1))}
                  onPlus={() => setChildren((v) => Math.min(12, v + 1))}
                />
                <Counter
                  title="Дітки до 110 см"
                  hint="безкоштовно"
                  hintColor="#6E6E73"
                  value={kids110}
                  onMinus={() => setKids110((v) => Math.max(0, v - 1))}
                  onPlus={() => setKids110((v) => Math.min(8, v + 1))}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 22,
                padding: '0 4px',
              }}
            >
              <div>
                <div style={eyebrow}>Разом</div>
                <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600 }}>{total} грн</div>
              </div>
              <button onClick={() => setStep('map')} style={primaryBtn}>
                Обрати місце →
              </button>
            </div>
          </div>
        )}

        {/* ─── КРОК 2: Карта ─────────────────────────────────────────── */}
        {step === 'map' && (
          <div
            style={{
              animation: 'fadeUp .4s ease',
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 320px',
              gap: 32,
              alignItems: 'start',
            }}
            className="map-grid"
          >
            <div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, margin: '0 0 4px' }}>
                Оберіть шезлонг
              </h1>
              <p style={{ color: '#86868B', margin: '0 0 18px', fontSize: 15 }}>
                Потрібно обрати {adults} — обрано {selectedSpots.length}
              </p>

              {closed && (
                <div
                  style={{
                    background: '#FFF4E5',
                    border: '1px solid #F0D5A8',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 18,
                    fontSize: 14,
                    color: '#7A5A1E',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Цього дня басейн зачинений.</strong>
                  {closedNote ? ` ${closedNote}.` : ''} Будь ласка, оберіть іншу дату.
                </div>
              )}

              <PoolMap
                mode="client"
                selected={selectedSpots}
                booked={booked}
                blocked={blocked}
                onSpotClick={spotClick}
              />
            </div>
            <div style={{ position: 'sticky', top: 90 }} className="map-sidebar">
              <div style={card}>
                <div style={{ ...eyebrow, marginBottom: 14 }}>Легенда</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                  <Legend color="#fff" border="#D2D2D7" label="Вільно" />
                  <Legend color="#1D1D1F" label="Ваш вибір" />
                  <Legend color="#E8E8ED" label="Зайнято" />
                  <Legend color="#C7C7CC" label="Недоступно" />
                </div>
                <div style={{ height: 1, background: '#E8E8ED', margin: '18px 0' }} />
                <div style={{ fontSize: 14, color: '#6E6E73' }}>Обрані місця</div>
                <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, minHeight: 30 }}>
                  {selectedSpots.length
                    ? selectedSpots.slice().sort((a, b) => a - b).join(', ')
                    : '—'}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button onClick={() => setStep('tariff')} style={ghostBtn}>
                    Назад
                  </button>
                  <button
                    onClick={() => {
                      if (closed) {
                        show('Цього дня басейн зачинений');
                        return;
                      }
                      if (selectedSpots.length !== adults) {
                        show(`Оберіть рівно ${adults} шезлонг(и)`);
                        return;
                      }
                      setStep('details');
                    }}
                    disabled={closed}
                    style={{ ...primaryBtnFull, opacity: closed ? 0.5 : 1, cursor: closed ? 'not-allowed' : 'pointer' }}
                  >
                    Далі →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── КРОК 3: Дані ──────────────────────────────────────────── */}
        {step === 'details' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 640, margin: '0 auto' }}>
            <h1
              style={{
                fontFamily: SERIF,
                fontWeight: 500,
                fontSize: 32,
                textAlign: 'center',
                margin: '0 0 24px',
              }}
            >
              Ваші дані
            </h1>
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="name-grid">
                <div>
                  <label style={eyebrow}>Ім&apos;я</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Олена"
                    autoComplete="given-name"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={eyebrow}>Прізвище</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Коваль"
                    autoComplete="family-name"
                    style={fieldStyle}
                  />
                </div>
              </div>
              <label style={{ ...eyebrow, display: 'block', marginTop: 18 }}>Телефон</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="097 030 53 01"
                inputMode="tel"
                autoComplete="tel"
                style={fieldStyle}
              />
            </div>
            <div style={{ ...card, padding: 22, marginTop: 18 }}>
              <div style={{ ...eyebrow, marginBottom: 14 }}>Деталі бронювання</div>
              {summaryRows.map((r) => (
                <SummaryRow key={r.k} k={r.k} v={r.v} />
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 14,
                }}
              >
                <span style={{ ...eyebrow, fontSize: 14 }}>До сплати</span>
                <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600 }}>{total} грн</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => setStep('map')} style={ghostBtn} disabled={paying}>
                Назад
              </button>
              <button
                onClick={() => {
                  if (!firstName.trim() || !lastName.trim()) {
                    show('Вкажіть імʼя та прізвище');
                    return;
                  }
                  if (!isValidPhone(phone)) {
                    show('Вкажіть дійсний номер телефону, напр. 097 123 45 67');
                    return;
                  }
                  doPay();
                }}
                disabled={paying}
                style={primaryBtnFull}
              >
                {paying ? 'Переходимо до оплати…' : 'Перейти до оплати →'}
              </button>
            </div>
          </div>
        )}

        {/* Крок «Оплата» відбувається на захищеній сторінці LiqPay
            (перекидання одразу після кроку «Дані»). */}

        {/* ─── КРОК 5: Підтвердження ─────────────────────────────────── */}
        {step === 'confirm' && (
          <div
            style={{
              animation: 'fadeUp .5s ease',
              maxWidth: 520,
              margin: '20px auto 0',
              textAlign: 'center',
            }}
          >
            <div
              className="ticket-hide-print"
              style={{
                width: 74,
                height: 74,
                borderRadius: '50%',
                background: '#3B9B4E',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 38,
                margin: '0 auto 20px',
              }}
            >
              ✓
            </div>
            <h1
              className="ticket-hide-print"
              style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 34, margin: '0 0 6px' }}
            >
              Бронювання підтверджено
            </h1>
            <p className="ticket-hide-print" style={{ color: '#86868B', margin: '0 0 24px' }}>
              Збережіть електронний квиток і покажіть код на вході.
            </p>

            {/* ─── Електронний квиток ─── */}
            <div id="ticket" style={{ ...card, textAlign: 'left', padding: 26 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingBottom: 16,
                  marginBottom: 16,
                  borderBottom: '1px dashed #D2D2D7',
                }}
              >
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>Підгорецький Маєток</div>
                  <div style={{ ...eyebrow, marginTop: 2 }}>Електронний квиток · Басейн</div>
                </div>
                <div style={{ fontSize: 30 }}>🎟️</div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <span style={{ ...eyebrow }}>Код брон.</span>
                <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>
                  {confirmed?.code || '—'}
                </span>
              </div>

              {confirmed?.name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ ...eyebrow, fontSize: 14 }}>Гість</span>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{confirmed.name}</span>
                </div>
              )}

              {confRows.map((r) => (
                <SummaryRow key={r.k} k={r.k} v={r.v} />
              ))}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px dashed #D2D2D7',
                }}
              >
                <span style={{ ...eyebrow, fontSize: 14 }}>Сплачено</span>
                <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: '#3B9B4E' }}>
                  {confTotal} грн
                </span>
              </div>
            </div>

            <div className="ticket-hide-print" style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={() => window.print()} style={ghostBtn}>
                Зберегти квиток
              </button>
              <button onClick={resetClient} style={primaryBtnFull}>
                Нове бронювання
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <Toast message={message} />

      {/* Адаптивність */}
      <style>{`
        @media (max-width: 820px) {
          .map-grid { grid-template-columns: 1fr !important; }
          .map-sidebar { position: static !important; }
        }
        @media (max-width: 560px) {
          /* Лічильники в один стовпець — головна причина горизонтальної прокрутки */
          .counters-grid { grid-template-columns: 1fr !important; }
          /* Імʼя та прізвище — в один стовпець на телефоні */
          .name-grid { grid-template-columns: 1fr !important; }
          /* Кроки в ОДИН рядок: підпис лише для поточного кроку, решта — цифри */
          .steps-row { gap: 6px !important; flex-wrap: nowrap !important; }
          .steps-row .step-conn { width: 14px !important; flex-shrink: 1; min-width: 8px; }
          .steps-row .step-label { font-size: 13px !important; white-space: nowrap; }
          .steps-row .step-label-off { display: none !important; }
        }
        @media (max-width: 380px) {
          .session-grid { grid-template-columns: 1fr !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          #ticket, #ticket * { visibility: visible !important; }
          #ticket {
            position: absolute; left: 0; top: 0; width: 100%;
            border: 1px solid #D2D2D7 !important; box-shadow: none !important;
          }
          .ticket-hide-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Дрібні підкомпоненти ────────────────────────────────────────────────
function Counter({
  title,
  hint,
  hintColor,
  value,
  onMinus,
  onPlus,
}: {
  title: string;
  hint: string;
  hintColor: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div style={{ border: '1px solid #E8E8ED', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 11, color: hintColor, marginBottom: 10 }}>{hint}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onMinus} style={stepBtn} aria-label={`${title}: менше`}>
          –
        </button>
        <span style={{ fontSize: 20, fontWeight: 500 }}>{value}</span>
        <button onClick={onPlus} style={stepBtn} aria-label={`${title}: більше`}>
          +
        </button>
      </div>
    </div>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          background: color,
          border: border ? `1.5px solid ${border}` : 'none',
        }}
      />{' '}
      {label}
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '7px 0',
        fontSize: 15,
        borderBottom: '1px solid #E8E8ED',
      }}
    >
      <span style={{ color: '#6E6E73' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}
