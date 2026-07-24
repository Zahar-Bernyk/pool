'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import { useBookingsOpen, PausedBanner } from '@/components/BookingStatus';
import Toast, { useToast } from '@/components/Toast';
import {
  ROOM_CATEGORIES,
  EXTRA_BED_PRICE,
  categoryById,
  nightsBetween,
  calcRoomTotal,
} from '@/lib/rooms';
import type { RoomBooking } from '@/lib/types';
import { SERIF, SANS, primaryBtn, primaryBtnFull, ghostBtn, fieldStyle, eyebrow, card } from '@/lib/ui';
import { downloadTicketPdf } from '@/lib/ticket-pdf';
import QRCode from '@/components/QRCode';

type Step = 'dates' | 'room' | 'details' | 'confirm';
const IND: { key: string; label: string }[] = [
  { key: 'dates', label: 'Дати' },
  { key: 'room', label: 'Номер' },
  { key: 'details', label: 'Дані' },
  { key: 'pay', label: 'Оплата' },
];

const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
function fmtDateNice(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
}
function pad(n: number) {
  return String(n).padStart(2, '0');
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysStr(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isValidPhone(raw: string): boolean {
  const d = (raw || '').replace(/\D/g, '');
  return (d.length === 10 && d.startsWith('0')) || (d.length === 12 && d.startsWith('380'));
}
function nightsWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'ніч';
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'ночі';
  return 'ночей';
}

export default function HotelPage() {
  return (
    <Suspense fallback={null}>
      <HotelInner />
    </Suspense>
  );
}

function HotelInner() {
  const params = useSearchParams();
  const { message, show } = useToast();
  const { open: bookingsOpen } = useBookingsOpen();

  const [step, setStep] = useState<Step>('dates');
  const [checkIn, setCheckIn] = useState(todayStr());
  const [checkOut, setCheckOut] = useState(addDaysStr(todayStr(), 1));
  const [guests, setGuests] = useState(2);
  const [extraBed, setExtraBed] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [avail, setAvail] = useState<Record<string, number> | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<RoomBooking | null>(null);

  const nights = nightsBetween(checkIn, checkOut);
  const total = categoryId ? calcRoomTotal(categoryId, nights, extraBed) : 0;

  const loadAvail = useCallback(async (ci: string, co: string) => {
    if (!ci || !co || co <= ci) {
      setAvail(null);
      return;
    }
    try {
      const r = await fetch(`/api/rooms/availability?check_in=${ci}&check_out=${co}`, { cache: 'no-store' });
      const j = await r.json();
      const map: Record<string, number> = {};
      (j.categories || []).forEach((c: { id: string; available: number }) => {
        map[c.id] = c.available;
      });
      setAvail(map);
      // Якщо обрана категорія стала недоступною — знімаємо вибір.
      setCategoryId((cur) => (cur && (map[cur] ?? 0) > 0 ? cur : ''));
    } catch {
      setAvail(null);
    }
  }, []);

  useEffect(() => {
    loadAvail(checkIn, checkOut);
  }, [checkIn, checkOut, loadAvail]);


  const [isApple, setIsApple] = useState(false);
  useEffect(() => {
    setIsApple(/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent));
  }, []);

  // Повернення з LiqPay (?paid=HR-####)
  useEffect(() => {
    const code = params.get('paid');
    if (!code) return;
    let stop = false;
    const poll = async (attempt = 0) => {
      try {
        const r = await fetch(`/api/rooms/payment/status?code=${code}`, { cache: 'no-store' });
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

  const changeCheckIn = (v: string) => {
    if (!v) return;
    setCheckIn(v);
    // виїзд завжди пізніше заїзду
    if (checkOut <= v) setCheckOut(addDaysStr(v, 1));
  };

  const doPay = async () => {
    if (paying) return;
    if (!categoryId) {
      show('Оберіть категорію номера');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      show('Вкажіть імʼя та прізвище');
      return;
    }
    if (!isValidPhone(phone)) {
      show('Вкажіть дійсний номер телефону, напр. 097 123 45 67');
      return;
    }
    setPaying(true);
    try {
      const r = await fetch('/api/rooms/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone,
          category: categoryId,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          extra_bed: extraBed,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setPaying(false);
        if (j.error === 'ROOM_TAKEN') {
          show('Номер щойно зайняли. Оберіть інші дати або категорію.');
          loadAvail(checkIn, checkOut);
          setStep('room');
        } else {
          show(j.message || 'Не вдалося створити бронювання.');
        }
        return;
      }
      if (j.mode === 'liqpay') {
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
      setConfirmed(j.booking);
      setStep('confirm');
      setPaying(false);
    } catch {
      setPaying(false);
      show('Помилка мережі. Спробуйте ще раз.');
    }
  };

  const resetAll = () => {
    setStep('dates');
    setCheckIn(todayStr());
    setCheckOut(addDaysStr(todayStr(), 1));
    setGuests(2);
    setExtraBed(false);
    setCategoryId('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setConfirmed(null);
  };

  const curIdx = step === 'confirm' ? 3 : ['dates', 'room', 'details'].indexOf(step);
  const selCat = categoryById(categoryId);

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1D1D1F', fontFamily: SANS }}>
      <SiteHeader subtitle="Готель · Онлайн бронювання" />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '26px 20px 80px' }}>
        {!bookingsOpen && <PausedBanner />}
        {bookingsOpen && (
        <>
        {/* Кроки */}
        <div className="steps-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
          {IND.map((s, i) => {
            const done = i < curIdx || step === 'confirm';
            const active = i === curIdx && step !== 'confirm';
            const filled = done || active;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, fontWeight: 500,
                      background: filled ? '#1D1D1F' : '#E8E8ED', color: filled ? '#fff' : '#86868B',
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className={`step-label ${i === curIdx ? 'step-label-on' : 'step-label-off'}`} style={{ fontSize: 13, color: filled ? '#1D1D1F' : '#86868B', fontWeight: filled ? 500 : 400 }}>
                    {s.label}
                  </span>
                </div>
                {i < IND.length - 1 && <div className="step-conn" style={{ width: 30, height: 1.5, background: done ? '#1D1D1F' : '#E8E8ED' }} />}
              </div>
            );
          })}
        </div>

        {/* ─── КРОК 1: Дати ─── */}
        {step === 'dates' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 640, margin: '0 auto' }}>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, textAlign: 'center', margin: '0 0 6px' }}>Оберіть дати</h1>
            <p style={{ color: '#86868B', textAlign: 'center', margin: '0 0 24px' }}>Заїзд та виїзд — вартість рахується за кожну ніч</p>

            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="name-grid">
                <DateBox label="Дата заїзду" value={checkIn} min={todayStr()} onChange={changeCheckIn} />
                <DateBox label="Дата виїзду" value={checkOut} min={addDaysStr(checkIn, 1)} onChange={(v) => v && setCheckOut(v)} />
              </div>
              <div style={{ marginTop: 14, textAlign: 'center', fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>
                {nights} {nightsWord(nights)}
              </div>

              <div style={{ ...eyebrow, margin: '22px 0 10px' }}>Гості</div>
              <Counter value={guests} min={1} max={8} onChange={setGuests} label="Кількість гостей" />
              <div style={{ fontSize: 12, color: '#86868B', marginTop: 8 }}>Діти до 6 років — безкоштовно (без окремого місця).</div>

              <button
                onClick={() => {
                  setExtraBed((v) => !v);
                }}
                style={{
                  width: '100%', marginTop: 16, padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                  border: `1.5px solid ${extraBed ? '#1D1D1F' : '#E8E8ED'}`, background: extraBed ? '#F5F5F7' : '#fff',
                  cursor: 'pointer', fontFamily: SANS, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>Додаткова постіль</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#86868B' }}>+{EXTRA_BED_PRICE} грн / доба</span>
                </span>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${extraBed ? '#1D1D1F' : '#D2D2D7'}`,
                  background: extraBed ? '#1D1D1F' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                }}>
                  {extraBed ? '✓' : ''}
                </span>
              </button>

              {nights >= 2 && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#EAF3EC', borderRadius: 10, fontSize: 13, color: '#2E7E5E' }}>
                  При бронюванні від 2 діб — відвідування літнього басейну включено у вартість.
                </div>
              )}
            </div>

            <button onClick={() => setStep('room')} style={{ ...primaryBtnFull, marginTop: 22 }}>
              Обрати номер →
            </button>
          </div>
        )}

        {/* ─── КРОК 2: Номер ─── */}
        {step === 'room' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 760, margin: '0 auto' }}>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, textAlign: 'center', margin: '0 0 6px' }}>Оберіть номер</h1>
            <p style={{ color: '#86868B', textAlign: 'center', margin: '0 0 24px' }}>
              {fmtDateNice(checkIn)} → {fmtDateNice(checkOut)} · {nights} {nightsWord(nights)}
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              {ROOM_CATEGORIES.map((c) => {
                const free = avail ? avail[c.id] ?? 0 : null;
                const disabled = free !== null && free <= 0;
                const isSel = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    disabled={disabled}
                    onClick={() => setCategoryId(c.id)}
                    style={{
                      textAlign: 'left', padding: '18px 20px', borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer',
                      border: `1.5px solid ${isSel ? '#1D1D1F' : '#E8E8ED'}`, background: isSel ? '#F5F5F7' : '#fff',
                      opacity: disabled ? 0.5 : 1, fontFamily: SANS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14,
                    }}
                  >
                    <span>
                      <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, display: 'block' }}>{c.title}</span>
                      <span style={{ fontSize: 13, color: '#6E6E73' }}>{c.desc}</span>
                      <span style={{ display: 'block', fontSize: 12, color: disabled ? '#C07A6E' : '#86868B', marginTop: 4 }}>
                        {free === null ? '' : disabled ? 'немає вільних на ці дати' : `вільно: ${free}`}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600 }}>{c.price}</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#86868B' }}>грн / доба</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {selCat && (
              <div style={{ ...card, marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...eyebrow, fontSize: 14 }}>Разом за {nights} {nightsWord(nights)}</span>
                <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600 }}>{total} грн</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => setStep('dates')} style={ghostBtn}>Назад</button>
              <button
                onClick={() => {
                  if (!categoryId) {
                    show('Оберіть категорію номера');
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
        )}

        {/* ─── КРОК 3: Дані ─── */}
        {step === 'details' && (
          <div style={{ animation: 'fadeUp .4s ease', maxWidth: 640, margin: '0 auto' }}>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, textAlign: 'center', margin: '0 0 24px' }}>Ваші дані</h1>
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="name-grid">
                <div>
                  <label style={eyebrow}>Ім&apos;я</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Олена" autoComplete="given-name" style={fieldStyle} />
                </div>
                <div>
                  <label style={eyebrow}>Прізвище</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Коваль" autoComplete="family-name" style={fieldStyle} />
                </div>
              </div>
              <label style={{ ...eyebrow, display: 'block', marginTop: 18 }}>Телефон</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="097 030 53 01" inputMode="tel" autoComplete="tel" style={fieldStyle} />
            </div>

            <div style={{ ...card, padding: 22, marginTop: 18 }}>
              <div style={{ ...eyebrow, marginBottom: 14 }}>Деталі бронювання</div>
              <Row k="Номер" v={selCat ? selCat.title : '—'} />
              <Row k="Заїзд" v={fmtDateNice(checkIn)} />
              <Row k="Виїзд" v={fmtDateNice(checkOut)} />
              <Row k="Ночей" v={`${nights} ${nightsWord(nights)}`} />
              <Row k="Гостей" v={String(guests)} />
              {extraBed && <Row k="Додаткова постіль" v={`+${EXTRA_BED_PRICE} грн / доба`} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <span style={{ ...eyebrow, fontSize: 14 }}>До сплати</span>
                <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600 }}>{total} грн</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => setStep('room')} style={ghostBtn} disabled={paying}>Назад</button>
              <button onClick={doPay} disabled={paying} style={primaryBtnFull}>
                {paying ? 'Переходимо до оплати…' : 'Перейти до оплати →'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Підтвердження / квиток ─── */}
        {step === 'confirm' && confirmed && (
          <div style={{ animation: 'fadeUp .5s ease', maxWidth: 520, margin: '20px auto 0', textAlign: 'center' }}>
            <div className="ticket-hide-print" style={{ width: 74, height: 74, borderRadius: '50%', background: '#3B9B4E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 20px' }}>✓</div>
            <h1 className="ticket-hide-print" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 34, margin: '0 0 6px' }}>Бронювання підтверджено</h1>
            <p className="ticket-hide-print" style={{ color: '#86868B', margin: '0 0 24px' }}>Збережіть підтвердження. Чекаємо на вас у готелі.</p>

            <div id="ticket" style={{ ...card, textAlign: 'left', padding: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 16, marginBottom: 16, borderBottom: '1px dashed #D2D2D7' }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>Підгорецький Маєток</div>
                  <div style={{ ...eyebrow, marginTop: 2 }}>Готель · Підтвердження бронювання</div>
                </div>
                <div style={{ fontSize: 30 }}>🏨</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={eyebrow}>Код брон.</span>
                <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>{confirmed.code}</span>
              </div>
              {confirmed.name && <Row k="Гість" v={confirmed.name} />}
              <Row k="Номер" v={`${categoryById(confirmed.category)?.title || 'Номер'} · №${confirmed.room}`} />
              <Row k="Заїзд" v={fmtDateNice(confirmed.check_in)} />
              <Row k="Виїзд" v={fmtDateNice(confirmed.check_out)} />
              <Row k="Ночей" v={`${confirmed.nights} ${nightsWord(confirmed.nights)}`} />
              {confirmed.extra_bed && <Row k="Додаткова постіль" v="так" />}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px dashed #D2D2D7' }}>
                <span style={{ ...eyebrow, fontSize: 14 }}>Сплачено</span>
                <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: '#3B9B4E' }}>{confirmed.amount} грн</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 22 }}>
                <QRCode value={confirmed.code} size={150} />
                <div style={{ fontSize: 12, color: '#86868B', marginTop: 8 }}>Покажіть цей код на рецепції</div>
              </div>
            </div>

            <div className="ticket-hide-print" style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  try {
                    await downloadTicketPdf({
                      subtitle: 'Готель · Підтвердження бронювання',
                      code: confirmed.code,
                      rows: [
                        ...(confirmed.name ? [{ label: 'Гість', value: confirmed.name }] : []),
                        {
                          label: 'Номер',
                          value: `${categoryById(confirmed.category)?.title || 'Номер'} · №${confirmed.room}`,
                        },
                        { label: 'Заїзд', value: fmtDateNice(confirmed.check_in) },
                        { label: 'Виїзд', value: fmtDateNice(confirmed.check_out) },
                        { label: 'Ночей', value: `${confirmed.nights} ${nightsWord(confirmed.nights)}` },
                        ...(confirmed.extra_bed ? [{ label: 'Додаткова постіль', value: 'так' }] : []),
                      ],
                      amount: confirmed.amount,
                      note: 'Покажіть це підтвердження на рецепції. Чекаємо на вас!',
                    });
                  } catch {
                    show('Не вдалося створити PDF. Спробуйте «Друк».');
                  }
                }}
                style={{ ...ghostBtn, flex: '1 1 160px' }}
              >
                Завантажити PDF
              </button>
              <button onClick={() => window.print()} style={{ ...ghostBtn, flex: '1 1 120px' }}>
                Друк
              </button>
              {isApple && (
                <a
                  href={`/api/wallet?code=${confirmed.code}`}
                  style={{
                    flex: '1 1 100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#000',
                    color: '#fff',
                    borderRadius: 100,
                    padding: '14px 28px',
                    fontFamily: SANS,
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textDecoration: 'none',
                  }}
                >
                   Додати в Apple Wallet
                </a>
              )}
              <button onClick={resetAll} style={{ ...primaryBtnFull, flex: '1 1 100%' }}>
                Нове бронювання
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <Toast message={message} />

      <style>{`
        @media (max-width: 560px) {
          .name-grid { grid-template-columns: 1fr !important; }
          .steps-row { gap: 6px !important; flex-wrap: nowrap !important; }
          .steps-row .step-conn { width: 14px !important; flex-shrink: 1; min-width: 8px; }
          .steps-row .step-label { font-size: 13px !important; white-space: nowrap; }
          .steps-row .step-label-off { display: none !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          #ticket, #ticket * { visibility: visible !important; }
          #ticket { position: absolute; left: 0; top: 0; width: 100%; border: 1px solid #D2D2D7 !important; box-shadow: none !important; }
          .ticket-hide-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Підкомпоненти ──────────────────────────────────────────────────────
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 15 }}>
      <span style={{ color: '#86868B' }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function Counter({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn = (txt: string, disabled: boolean, fn: () => void) => (
    <button
      onClick={fn}
      disabled={disabled}
      aria-label={txt === '−' ? 'Менше' : 'Більше'}
      style={{
        width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #D2D2D7', background: '#fff',
        fontSize: 20, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#C7C7CC' : '#1D1D1F', lineHeight: 1,
      }}
    >
      {txt}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {btn('−', value <= min, () => onChange(Math.max(min, value - 1)))}
        <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{value}</span>
        {btn('+', value >= max, () => onChange(Math.min(max, value + 1)))}
      </div>
    </div>
  );
}

function DateBox({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={eyebrow}>{label}</label>
      <div style={{ position: 'relative', marginTop: 6 }}>
        <div style={{ width: '100%', padding: '15px 16px', border: '1px solid #D2D2D7', borderRadius: 12, fontFamily: SANS, fontSize: 15, color: '#1D1D1F', background: '#F5F5F7', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 500 }}>{fmtDateNice(value)}</span>
          <span style={{ fontSize: 12, color: '#86868B' }}>{WEEKDAYS_SHORT[new Date(value + 'T00:00:00').getDay()]}</span>
        </div>
        <input
          type="date"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', background: 'transparent', cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
        />
      </div>
    </div>
  );
}
