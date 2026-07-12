'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtDate, todayStr } from '@/lib/dates';
import { ALL_ROOMS, ROOM_TO_CATEGORY } from '@/lib/rooms';
import { SERIF, SANS, primaryBtnFull, fieldStyle, eyebrow, card } from '@/lib/ui';

export type Closure = {
  id: string;
  room?: number | null;
  start_date: string;
  end_date: string;
  note: string | null;
};

type Props = {
  /** 'pool' — закриття днів басейну; 'rooms' — закриття номерів готелю. */
  kind: 'pool' | 'rooms';
  onToast: (msg: string) => void;
};

const endpoint = (kind: Props['kind']) => (kind === 'pool' ? '/api/closures' : '/api/rooms/closures');

export default function Closures({ kind, onToast }: Props) {
  const [list, setList] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());
  const [note, setNote] = useState('');
  const [room, setRoom] = useState<string>(''); // '' = всі номери

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(endpoint(kind), { cache: 'no-store' }).then((x) => x.json());
      setList(r.closures || []);
    } catch {
      onToast('Не вдалося завантажити закриття');
    }
    setLoading(false);
  }, [kind, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (end < start) {
      onToast('Дата завершення раніша за початок');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        start_date: start,
        end_date: end,
        note: note.trim() || null,
      };
      if (kind === 'rooms') body.room = room === '' ? null : Number(room);

      const res = await fetch(endpoint(kind), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Помилка');

      onToast('Закриття додано');
      setNote('');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Помилка');
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`${endpoint(kind)}?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Помилка');
      onToast('Закриття знято');
      await load();
    } catch {
      onToast('Не вдалося зняти');
    }
    setBusy(false);
  }

  const rangeText = (c: Closure) =>
    c.start_date === c.end_date ? fmtDate(c.start_date) : `${fmtDate(c.start_date)} — ${fmtDate(c.end_date)}`;

  const roomText = (c: Closure) => {
    if (c.room == null) return 'Усі номери';
    const cat = ROOM_TO_CATEGORY[c.room];
    return `№${c.room}${cat ? ` · ${cat.title}` : ''}`;
  };

  return (
    <div>
      {/* Форма додавання */}
      <div style={{ ...card, marginBottom: 20 }}>
        <span style={eyebrow}>
          {kind === 'pool' ? 'Закрити басейн на дати' : 'Закрити номер на дати'}
        </span>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: kind === 'rooms' ? '1fr 1fr 1fr' : '1fr 1fr',
            marginTop: 14,
          }}
        >
          {kind === 'rooms' && (
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Номер</span>
              <select value={room} onChange={(e) => setRoom(e.target.value)} style={fieldStyle}>
                <option value="">Усі номери (весь готель)</option>
                {ALL_ROOMS.map((r) => (
                  <option key={r} value={r}>
                    №{r} · {ROOM_TO_CATEGORY[r]?.title || ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: 'block' }}>
            <span style={labelStyle}>Від</span>
            <input
              type="date"
              value={start}
              min={todayStr()}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: 'block' }}>
            <span style={labelStyle}>До (включно)</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              style={fieldStyle}
            />
          </label>
        </div>

        <label style={{ display: 'block', marginTop: 12 }}>
          <span style={labelStyle}>Причина (не обов'язково)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === 'pool' ? 'Санітарний день, приватна подія…' : 'Ремонт, технічне обслуговування…'}
            style={fieldStyle}
          />
        </label>

        <button onClick={add} disabled={busy} style={{ ...primaryBtnFull, marginTop: 16, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Збереження…' : 'Закрити на ці дати'}
        </button>

        <p style={{ ...hintStyle, marginTop: 12 }}>
          {kind === 'pool'
            ? 'У ці дні гості не зможуть забронювати лежаки. Наявні бронювання лишаються — скасуйте їх окремо, якщо потрібно.'
            : 'Номер (або весь готель) буде недоступний для бронювання на вибрані дати. Наявні бронювання лишаються.'}
        </p>
      </div>

      {/* Список */}
      <span style={eyebrow}>Активні закриття</span>
      {loading ? (
        <p style={hintStyle}>Завантаження…</p>
      ) : list.length === 0 ? (
        <p style={hintStyle}>Закриттів немає — усе відкрито для бронювання.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {list.map((c) => {
            const past = c.end_date < todayStr();
            return (
              <div
                key={c.id}
                style={{
                  ...card,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  opacity: past ? 0.5 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {kind === 'rooms' && (
                    <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: '#5c4d3f' }}>
                      {roomText(c)}
                    </div>
                  )}
                  <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: '#2a2622' }}>
                    {rangeText(c)}
                  </div>
                  {c.note && <div style={{ ...hintStyle, marginTop: 2 }}>{c.note}</div>}
                  {past && <div style={{ ...hintStyle, marginTop: 2 }}>минуле</div>}
                </div>

                <button
                  onClick={() => remove(c.id)}
                  disabled={busy}
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    padding: '8px 14px',
                    border: '1px solid #e4ddce',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#b33',
                    cursor: busy ? 'default' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Зняти
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  fontFamily: SANS,
  fontSize: 12,
  color: '#9a9186',
  display: 'block',
  marginBottom: 6,
} as const;

const hintStyle = {
  fontFamily: SANS,
  fontSize: 12.5,
  color: '#9a9186',
  lineHeight: 1.5,
} as const;
