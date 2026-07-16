'use client';

import { useEffect, useState } from 'react';
import { SERIF, SANS } from '@/lib/ui';

/** Читає глобальний статус бронювання. open=true поки  не завантажилось (щоб не блимало). */
export function useBookingsOpen() {
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/booking-status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setOpen(j.open !== false);
        setNote(j.note || null);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  return { open, note, loaded };
}

/** Помітний банер «бронювання призупинено». */
export function PausedBanner({ note }: { note?: string | null }) {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto 24px',
        padding: '20px 22px',
        borderRadius: 14,
        border: '1px solid #F0C9C9',
        background: '#FDECEC',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: '#8A2E2E' }}>
        Бронювання тимчасово призупинено
      </div>
      <div style={{ fontFamily: SANS, fontSize: 14, color: '#9A5A5A', marginTop: 6, lineHeight: 1.5 }}>
        {note
          ? note
          : 'Наразі онлайн-бронювання недоступне. Зверніться, будь ласка, за телефоном '}
        {!note && (
          <a href="tel:+380970305301" style={{ color: '#8A2E2E', fontWeight: 600 }}>
            +380 97 030 53 01
          </a>
        )}
      </div>
    </div>
  );
}
