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
  weekdays?: number[] | null;
};

// 0=нд … 6=сб (як extract(dow) у Postgres). Порядок показу: Пн→Нд.
const WEEKDAYS: { dow: number; short: string; full: string }[] = [
  { dow: 1, short: 'Пн', full: 'понеділок' },
  { dow: 2, short: 'Вт', full: 'вівторок' },
  { dow: 3, short: 'Ср', full: 'середа' },
  { dow: 4, short: 'Чт', full: 'четвер' },
  { dow: 5, short: 'Пт', full: "п'ятниця" },
  { dow: 6, short: 'Сб', full: 'субота' },
  { dow: 0, short: 'Нд', full: 'неділя' },
];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
  const [weekdays, setWeekdays] = useState<number[]>([]); // порожньо = всі дні

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
        weekdays: weekdays.length ? weekdays : null,
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
      setWeekdays([]);
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

  const weekdaysText = (c: Closure) => {
    if (!c.weekdays || c.weekdays.length === 0) return null;
    if (c.weekdays.length === 7) return null;
    const names = WEEKDAY_ORDER.filter((d) => c.weekdays!.includes(d)).map(
      (d) => WEEKDAYS.find((w) => w.dow === d)!.short
    );
    // будні / вихідні — красивіші підписи
    const set = new Set(c.weekdays);
    const isWeekdays = [1, 2, 3, 4, 5].every((d) => set.has(d)) && !set.has(0) && !set.has(6);
    const isWeekend = set.has(0) && set.has(6) && set.size === 2;
    if (isWeekdays) return 'лише будні';
    if (isWeekend) return 'лише вихідні';
    return 'лише: ' + names.join(', ');
  };

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

        {/* Дні тижня: якщо нічого не обрано — закриття діє на всі дні */}
        <div style={{ marginTop: 14 }}>
          <span style={labelStyle}>Дні тижня (не обов'язково)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {WEEKDAY_ORDER.map((dow) => {
              const w = WEEKDAYS.find((x) => x.dow === dow)!;
              const on = weekdays.includes(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() =>
                    setWeekdays((prev) =>
                      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]
                    )
                  }
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${on ? '#5c4d3f' : '#e4ddce'}`,
                    background: on ? '#5c4d3f' : '#fff',
                    color: on ? '#fff' : '#2a2622',
                    cursor: 'pointer',
                  }}
                >
                  {w.short}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setWeekdays([1, 2, 3, 4, 5])} style={chipQuick}>
              Лише будні
            </button>
            <button type="button" onClick={() => setWeekdays([0, 6])} style={chipQuick}>
              Лише вихідні
            </button>
            {weekdays.length > 0 && (
              <button type="button" onClick={() => setWeekdays([])} style={chipQuick}>
                Скинути (усі дні)
              </button>
            )}
          </div>
          <p style={{ ...hintStyle, marginTop: 8 }}>
            {weekdays.length === 0
              ? 'Закриється кожен день у вибраному періоді.'
              : 'Закриються лише вибрані дні тижня в межах періоду.'}
          </p>
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
                  {weekdaysText(c) && (
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: '#6f7d2f', fontWeight: 600, marginTop: 2 }}>
                      {weekdaysText(c)}
                    </div>
                  )}
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

const chipQuick = {
  fontFamily: SANS,
  fontSize: 12,
  padding: '6px 12px',
  borderRadius: 100,
  border: '1px solid #e4ddce',
  background: '#faf6ee',
  color: '#5c4d3f',
  cursor: 'pointer',
} as const;
