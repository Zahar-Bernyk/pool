'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PoolMap from '@/components/PoolMap';
import SiteHeader from '@/components/SiteHeader';
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

export default function BookingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#FBFAF6' }} />}>
      <BookingInner />
    </Suspense>
  );
}

function BookingInner() {
  const params = useSearchParams();
  const { message, show } = useToast();

  const [step, setStep] = useState<Step>('tariff');
  const [session, setSession] = useState<Session>('day');
  const [date, setDate] = useState<string>(todayStr());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [kids110, setKids110] = useState(0);
  const [selectedSpots, setSelectedSpots] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const [booked, setBooked] = useState<number[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);

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
  const changeSession = (s: Session) => {
    setSession(s);
    setSelectedSpots([]);
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
        body: JSON.stringify({ name, phone, date, session, adults, children, kids110, spots: selectedSpots }),
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
    setName('');
    setPhone('');
    setCardNum('');
    setCardExp('');
    setCardCvv('');
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
    <div style={{ minHeight: '100vh', background: '#FBFAF6', color: '#3A322A' }}>
      <SiteHeader subtitle="Басейн · Онлайн бронювання" />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 22px 70px' }}>
        {/* Кроки */}
        <div
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
                      background: filled ? '#2E2A24' : '#ECE4D6',
                      color: filled ? '#fff' : '#9A8C7B',
                    }}
                  >
                    {i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: filled ? '#3A322A' : '#9A8C7B',
                      fontWeight: filled ? 500 : 400,
                    }}
                  >
                    {STEP_LABELS[k]}
                  </span>
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div style={{ width: 30, height: 1.5, background: done ? '#2E2A24' : '#ECE4D6' }} />
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
            <p style={{ textAlign: 'center', color: '#9A8C7B', margin: '0 0 30px', fontSize: 15 }}>
              Дорослий абонемент включає шезлонг біля басейну
            </p>

            <div style={card}>
              <div style={{ ...eyebrow, marginBottom: 12 }}>Дата візиту</div>
              <input
                type="date"
                value={date}
                min={todayStr()}
                onChange={(e) => changeDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  border: '1px solid #E0D6C8',
                  borderRadius: 12,
                  fontFamily: SANS,
                  fontSize: 16,
                  color: '#3A322A',
                  background: '#FBF8F3',
                }}
              />
              <div style={{ marginTop: 8, fontSize: 13, color: wknd ? '#B5985A' : '#9A8C7B' }}>
                {fmtDate(date)}
                {wknd ? ' · вихідний' : ' · будній'}
              </div>

              <div style={{ ...eyebrow, margin: '24px 0 12px' }}>Сеанс</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button onClick={() => changeSession('day')} style={selectCard(session === 'day')}>
                  <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600 }}>Цілий день</div>
                  <div style={{ fontSize: 13, color: '#9A8C7B', marginTop: 2 }}>10:00 – 20:00</div>
                  <div style={{ marginTop: 10, fontSize: 15, fontWeight: 500 }}>
                    {unitPrice('day', wknd, 'adult')} грн{' '}
                    <span style={{ color: '#9A8C7B', fontWeight: 400 }}>/ дорослий</span>
                  </div>
                </button>
                <button
                  onClick={() => changeSession('evening')}
                  style={selectCard(session === 'evening')}
                >
                  <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600 }}>
                    Вечірнє плавання
                  </div>
                  <div style={{ fontSize: 13, color: '#9A8C7B', marginTop: 2 }}>17:00 – 20:00</div>
                  <div style={{ marginTop: 10, fontSize: 15, fontWeight: 500 }}>
                    {unitPrice('evening', wknd, 'adult')} грн{' '}
                    <span style={{ color: '#9A8C7B', fontWeight: 400 }}>/ дорослий</span>
                  </div>
                </button>
              </div>

              <div
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
                  hintColor="#9A8C7B"
                  value={adults}
                  onMinus={() => adjAdults(-1)}
                  onPlus={() => adjAdults(1)}
                />
                <Counter
                  title="Діти до 12"
                  hint={`${unitPrice(session, wknd, 'child')} грн · без шезлонга`}
                  hintColor="#9A8C7B"
                  value={children}
                  onMinus={() => setChildren((v) => Math.max(0, v - 1))}
                  onPlus={() => setChildren((v) => Math.min(12, v + 1))}
                />
                <Counter
                  title="Дітки до 110 см"
                  hint="безкоштовно"
                  hintColor="#7FA88C"
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
              <p style={{ color: '#9A8C7B', margin: '0 0 18px', fontSize: 15 }}>
                Потрібно обрати {adults} — обрано {selectedSpots.length}
              </p>
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
                  <Legend color="#fff" border="#C9B89F" label="Вільно" />
                  <Legend color="#2E2A24" label="Ваш вибір" />
                  <Legend color="#E8E1D5" label="Зайнято" />
                  <Legend color="#C7B0A3" label="Недоступно" />
                </div>
                <div style={{ height: 1, background: '#EFE9DD', margin: '18px 0' }} />
                <div style={{ fontSize: 14, color: '#6E6253' }}>Обрані місця</div>
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
                      if (selectedSpots.length !== adults) {
                        show(`Оберіть рівно ${adults} шезлонг(и)`);
                        return;
                      }
                      setStep('details');
                    }}
                    style={primaryBtnFull}
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
              <label style={eyebrow}>Ім&apos;я та прізвище</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Олена Коваль"
                style={fieldStyle}
              />
              <label style={{ ...eyebrow, display: 'block', marginTop: 18 }}>Телефон</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="097 030 53 01"
                inputMode="tel"
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
              <button onClick={() => setStep('map')} style={ghostBtn}>
                Назад
              </button>
              <button
                onClick={() => {
                  if (!name.trim() || !phone.trim()) {
                    show('Вкажіть імʼя та телефон');
                    return;
                  }
                  setStep('payment');
                }}
                style={primaryBtnFull}
              >
                До оплати →
              </button>
            </div>
          </div>
        )}

        {/* ─── КРОК 4: Оплата ────────────────────────────────────────── */}
        {step === 'payment' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 460, margin: '10px auto 0' }}>
            <div
              style={{
                background: 'linear-gradient(150deg,#3B9B4E,#2E7E5E)',
                borderRadius: 20,
                padding: 24,
                color: '#fff',
                boxShadow: '0 18px 40px -16px rgba(46,126,94,.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, letterSpacing: 1, fontSize: 18 }}>Privat24</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>Безпечна оплата</span>
              </div>
              <div style={{ marginTop: 30, fontSize: 13, opacity: 0.85 }}>Сума до сплати</div>
              <div style={{ fontSize: 34, fontWeight: 600 }}>{total},00 ₴</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                Підгорецький Маєток · Басейн
              </div>
            </div>

            <div style={{ ...card, padding: 24, marginTop: 16 }}>
              <label style={eyebrow}>Номер картки</label>
              <input
                value={cardNum}
                onChange={(e) => setCardNum(e.target.value)}
                placeholder="0000 0000 0000 0000"
                inputMode="numeric"
                style={fieldStyle}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                <div>
                  <label style={eyebrow}>Термін</label>
                  <input
                    value={cardExp}
                    onChange={(e) => setCardExp(e.target.value)}
                    placeholder="ММ/РР"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={eyebrow}>CVV</label>
                  <input
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="•••"
                    inputMode="numeric"
                    style={fieldStyle}
                  />
                </div>
              </div>
              <button
                onClick={doPay}
                disabled={paying}
                style={{
                  width: '100%',
                  marginTop: 18,
                  padding: 15,
                  border: 'none',
                  borderRadius: 12,
                  background: paying ? '#7FB08A' : '#3B9B4E',
                  color: '#fff',
                  fontFamily: SANS,
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: paying ? 'wait' : 'pointer',
                }}
              >
                {paying ? 'Обробка платежу…' : `Сплатити ${total} ₴`}
              </button>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#9A8C7B', marginTop: 12 }}>
                Демо-режим — реальні кошти не списуються
              </div>
              <button onClick={() => setStep('details')} style={ghostBtnFull}>
                Назад
              </button>
            </div>
          </div>
        )}

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
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 34, margin: '0 0 6px' }}>
              Бронювання підтверджено
            </h1>
            <p style={{ color: '#9A8C7B', margin: '0 0 24px' }}>
              Чекаємо на вас. Деталі надіслано на ваш телефон.
            </p>
            <div style={{ ...card, textAlign: 'left' }}>
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
              {confRows.map((r) => (
                <SummaryRow key={r.k} k={r.k} v={r.v} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ ...eyebrow, fontSize: 14 }}>Сплачено</span>
                <span
                  style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: '#3B9B4E' }}
                >
                  {confTotal} грн
                </span>
              </div>
            </div>
            <button onClick={resetClient} style={{ ...primaryBtn, marginTop: 24 }}>
              Нове бронювання
            </button>
          </div>
        )}
      </div>

      <Toast message={message} />

      {/* Адаптивність: на вузьких екранах карта й сайдбар стають в один стовпець */}
      <style>{`
        @media (max-width: 820px) {
          .map-grid { grid-template-columns: 1fr !important; }
          .map-sidebar { position: static !important; }
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
    <div style={{ border: '1px solid #EFE9DD', borderRadius: 14, padding: 16 }}>
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
        borderBottom: '1px solid #F2EBE0',
      }}
    >
      <span style={{ color: '#6E6253' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}
