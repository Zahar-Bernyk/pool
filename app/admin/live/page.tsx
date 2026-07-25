'use client';

import { useCallback, useEffect, useState } from 'react';
import { SERIF, SANS } from '@/lib/ui';
import { fmtDate, todayStr } from '@/lib/dates';
import type { Booking } from '@/lib/types';

interface RoomRow {
  id: string;
  code: string;
  name: string;
  room: number;
  check_in: string;
  check_out: string;
  amount: number;
}

// Компактне «живе» вікно для монітора на рецепції.
// Відкривається кнопкою з адмін-панелі та само оновлюється щохвилини.
export default function LivePage() {
  const [pool, setPool] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [at, setAt] = useState('');
  const today = todayStr();

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        fetch('/api/bookings', { cache: 'no-store' }).then((x) => x.json()),
        fetch('/api/rooms/bookings', { cache: 'no-store' }).then((x) => x.json()),
      ]);
      setPool(b.bookings || []);
      setRooms(r.bookings || []);
      setAt(new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      /* мовчки — спробуємо наступного разу */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const poolToday = pool.filter((b) => b.date === today && b.status === 'active');
  const roomsToday = rooms.filter((b) => b.check_in <= today && today < b.check_out);
  const spotsBusy = new Set(poolToday.flatMap((b) => b.spots)).size;

  const card = {
    background: '#fff',
    border: '1px solid #E8E8ED',
    borderRadius: 14,
    padding: 14,
  } as const;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7', fontFamily: SANS, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, margin: 0 }}>Сьогодні · {fmtDate(today)}</h1>
        <span style={{ fontSize: 12, color: '#86868B' }}>оновлено {at}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: '#86868B', textTransform: 'uppercase' }}>Басейн</div>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>{poolToday.length}</div>
          <div style={{ fontSize: 12, color: '#86868B' }}>{spotsBusy} лежаків зайнято</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: '#86868B', textTransform: 'uppercase' }}>Готель</div>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>{roomsToday.length}</div>
          <div style={{ fontSize: 12, color: '#86868B' }}>номерів зайнято</div>
        </div>
      </div>

      <Section title="Басейн сьогодні">
        {poolToday.length === 0 ? (
          <Empty />
        ) : (
          poolToday.map((b) => (
            <Line
              key={b.id}
              left={b.name || '—'}
              sub={`${b.code} · місця ${b.spots.slice().sort((x, y) => x - y).join(', ')}`}
              right={`${b.amount} ₴`}
              paid={b.paid}
            />
          ))
        )}
      </Section>

      <Section title="Готель сьогодні">
        {roomsToday.length === 0 ? (
          <Empty />
        ) : (
          roomsToday.map((b) => (
            <Line
              key={b.id}
              left={b.name || '—'}
              sub={`${b.code} · №${b.room} · до ${fmtDate(b.check_out)}`}
              right={`${b.amount} ₴`}
              paid
            />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: '#86868B', textTransform: 'uppercase', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 16, color: '#86868B', fontSize: 14 }}>Порожньо.</div>;
}

function Line({ left, sub, right, paid }: { left: string; sub: string; right: string; paid: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        borderTop: '1px solid #F0F0F2',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>{left}</div>
        <div style={{ fontSize: 12, color: '#86868B' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ fontWeight: 600 }}>{right}</div>
        <div style={{ fontSize: 11, color: paid ? '#3B9B4E' : '#B7791F' }}>{paid ? 'Оплачено' : 'Очікує'}</div>
      </div>
    </div>
  );
}
