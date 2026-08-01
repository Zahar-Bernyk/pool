'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SERIF, SANS, fieldStyle, primaryBtnFull, ghostBtn, eyebrow } from '@/lib/ui';
import { EVENT_TYPES, EVENT_STATUSES, VENUES } from '@/lib/events/filter';

type Role = 'admin' | 'superadmin';

interface Booking {
  id: string;
  code: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  guests_count: number | null;
  venue: string | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
  // лише для супер-адміна
  client_name?: string | null;
  phone?: string | null;
  email?: string | null;
  price_total?: number | null;
  notes?: string | null;
  // лише для адміна
  has_deposit?: boolean;
  restricted?: boolean;
}

interface Appointment {
  id: string;
  booking_id: string | null;
  title: string;
  starts_at: string;
  place: string | null;
  notes: string | null;
  done: boolean;
  created_by_name: string | null;
}

type Tab = 'list' | 'calendar' | 'appointments' | 'reports' | 'logins';

const MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WD = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase().slice(0, 3)} ${d.getFullYear()}`;
}

export default function EventsPanel() {
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [me, setMe] = useState<{ email: string; fullName: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>('list');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [logins, setLogins] = useState<{ id: string; full_name: string; email: string; logged_in_at: string }[]>([]);
  const [msg, setMsg] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState('');

  const toast = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3500);
  };

  // ── Завантаження ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const s = await fetch('/api/events/session', { cache: 'no-store' });
      if (s.status === 401) {
        router.replace('/admin-restaurant/login');
        return;
      }
      const sj = await s.json();
      setRole(sj.staff.role);
      setMe({ email: sj.staff.email, fullName: sj.staff.fullName });

      const [b, a] = await Promise.all([
        fetch('/api/events/bookings', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/events/appointments', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setBookings(b.bookings || []);
      setAppointments(a.appointments || []);

      if (sj.staff.role === 'superadmin') {
        const l = await fetch('/api/events/logins', { cache: 'no-store' }).then((r) => r.json());
        setLogins(l.log || []);
      }
    } catch {
      toast('Не вдалося завантажити дані.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace('/admin-restaurant/login');
  };

  // ── Похідні дані ─────────────────────────────────────────────────
  const upcoming = useMemo(
    () => bookings.filter((b) => b.event_date >= todayISO() && b.status !== 'cancelled'),
    [bookings],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        b.code.toLowerCase().includes(q) ||
        (b.client_name || '').toLowerCase().includes(q) ||
        (b.venue || '').toLowerCase().includes(q) ||
        (EVENT_TYPES[b.event_type] || '').toLowerCase().includes(q),
    );
  }, [bookings, search]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, color: '#86868B' }}>
        Завантаження…
      </div>
    );
  }

  const TABS: [Tab, string][] = [
    ['list', 'Бронювання'],
    ['calendar', 'Календар'],
    ['appointments', 'Зустрічі'],
    ...(role === 'superadmin' ? ([['reports', 'Звіти'], ['logins', 'Журнал входів']] as [Tab, string][]) : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7', fontFamily: SANS, color: '#1D1D1F' }}>
      {/* Шапка */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E8ED', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>Підгорецький Маєток</div>
            <div style={{ ...eyebrow, marginTop: 2 }}>
              Події · {role === 'superadmin' ? 'Супер-адміністратор' : 'Адміністратор'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#86868B' }}>{me?.fullName || me?.email}</span>
            <button onClick={logout} style={{ ...ghostBtn, padding: '8px 16px', fontSize: 13 }}>
              Вийти
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 20 }}>
        {/* Обмеження для адміністратора */}
        {role === 'admin' && (
          <div style={{ background: '#FDF6E7', border: '1px solid #EAD9AE', borderRadius: 12, padding: 14, marginBottom: 18, fontSize: 14, lineHeight: 1.6 }}>
            Ви бачите зайнятість і можете вносити бронювання. Контактні дані гостей і суми
            завдатків доступні лише супер-адміністратору.
          </div>
        )}

        {/* Вкладки */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                ...ghostBtn,
                padding: '9px 18px',
                fontSize: 13,
                background: tab === k ? '#1D1D1F' : '#fff',
                color: tab === k ? '#fff' : '#1D1D1F',
                borderColor: tab === k ? '#1D1D1F' : '#D2D2D7',
              }}
            >
              {label}
            </button>
          ))}
          <button onClick={() => setShowAdd(true)} style={{ ...primaryBtnFull, width: 'auto', padding: '9px 20px', fontSize: 13, marginLeft: 'auto' }}>
            + Нове бронювання
          </button>
        </div>

        {/* Зведення */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
          <Stat value={String(upcoming.length)} label="майбутніх подій" />
          <Stat value={String(bookings.filter((b) => b.status === 'tentative').length)} label="попередніх" />
          <Stat value={String(appointments.filter((a) => !a.done).length)} label="зустрічей попереду" />
          {role === 'superadmin' && (
            <Stat
              value={`${bookings.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + (b.price_total || 0), 0).toLocaleString('uk-UA')} ₴`}
              label="сума договорів"
            />
          )}
        </div>

        {tab === 'list' && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={role === 'superadmin' ? 'Пошук: код, клієнт, зала' : 'Пошук: код, зала, тип'}
              style={{ ...fieldStyle, maxWidth: 380, marginBottom: 14 }}
            />
            {shown.length === 0 ? (
              <Empty text="Бронювань ще немає. Натисніть «Нове бронювання»." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {shown.map((b) => (
                  <BookingCard key={b.id} b={b} role={role!} onOpen={() => setDetail(b)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'calendar' && (
          <CalendarView bookings={bookings} offset={monthOffset} setOffset={setMonthOffset} onOpen={setDetail} />
        )}

        {tab === 'appointments' && (
          <AppointmentsView
            list={appointments}
            bookings={bookings}
            defaultName={me?.fullName || ''}
            onChanged={load}
            onToast={toast}
          />
        )}

        {tab === 'reports' && role === 'superadmin' && <ReportsView bookings={bookings} />}

        {tab === 'logins' && role === 'superadmin' && (
          <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, overflow: 'hidden' }}>
            {logins.length === 0 ? (
              <div style={{ padding: 24, color: '#86868B' }}>Записів немає.</div>
            ) : (
              logins.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderTop: i ? '1px solid #F0F0F2' : 'none', fontSize: 14 }}>
                  <span style={{ fontWeight: 500 }}>{l.full_name}</span>
                  <span style={{ color: '#86868B', fontSize: 13 }}>
                    {new Date(l.logged_in_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <AddBooking
          role={role!}
          defaultName={me?.fullName || ''}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
            toast('Бронювання створено');
          }}
          onToast={toast}
        />
      )}

      {detail && (
        <BookingDetail
          b={detail}
          role={role!}
          defaultName={me?.fullName || ''}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            load();
          }}
          onToast={toast}
        />
      )}

      {msg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1D1D1F', color: '#fff', padding: '12px 22px', borderRadius: 100, fontSize: 14, zIndex: 200 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ── Дрібні елементи ────────────────────────────────────────────────
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 14, padding: 16 }}>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#86868B', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 28, color: '#86868B' }}>
      {text}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    tentative: { bg: '#FDF3E4', c: '#B7791F' },
    confirmed: { bg: '#E4F0E6', c: '#3B9B4E' },
    completed: { bg: '#F0F0F2', c: '#6E6E73' },
    cancelled: { bg: '#FDECEC', c: '#C0392B' },
  };
  const s = map[status] || map.tentative;
  return (
    <span style={{ background: s.bg, color: s.c, fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999 }}>
      {EVENT_STATUSES[status] || status}
    </span>
  );
}

function BookingCard({ b, role, onOpen }: { b: Booking; role: Role; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff',
        border: '1px solid #E8E8ED',
        borderRadius: 14,
        padding: 16,
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        opacity: b.status === 'cancelled' ? 0.55 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600 }}>
            {EVENT_TYPES[b.event_type] || b.event_type}
          </span>
          <span style={{ fontSize: 12, color: '#A0A0A5' }}>{b.code}</span>
          <StatusChip status={b.status} />
        </div>
        <div style={{ fontSize: 14, color: '#6E6E73', marginTop: 4 }}>
          {fmtDate(b.event_date)}
          {b.end_date ? ` → ${fmtDate(b.end_date)}` : ''}
          {b.venue ? ` · ${b.venue}` : ''}
          {b.guests_count ? ` · ${b.guests_count} гостей` : ''}
        </div>
        {role === 'superadmin' && b.client_name && (
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {b.client_name}
            {b.phone ? ` · ${b.phone}` : ''}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        {role === 'superadmin' ? (
          b.price_total ? <div style={{ fontWeight: 600 }}>{b.price_total.toLocaleString('uk-UA')} ₴</div> : null
        ) : b.has_deposit ? (
          <span style={{ fontSize: 12, color: '#3B9B4E', fontWeight: 600 }}>завдаток внесено</span>
        ) : (
          <span style={{ fontSize: 12, color: '#B7791F' }}>без завдатку</span>
        )}
        {b.created_by_name && (
          <div style={{ fontSize: 11, color: '#A0A0A5', marginTop: 4 }}>вніс: {b.created_by_name}</div>
        )}
      </div>
    </div>
  );
}

// ── Швидке внесення ────────────────────────────────────────────────
function AddBooking({
  role,
  defaultName,
  onClose,
  onSaved,
  onToast,
}: {
  role: Role;
  defaultName: string;
  onClose: () => void;
  onSaved: () => void;
  onToast: (m: string) => void;
}) {
  // Обовʼязкові лише два поля — щоб записати клієнта за секунди.
  const [form, setForm] = useState({
    event_type: 'wedding',
    event_date: '',
    client_name: '',
    phone: '',
    guests_count: '',
    venue: '',
    price_total: '',
    notes: '',
    created_by_name: defaultName,
  });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.event_date) {
      onToast('Вкажіть дату події.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/events/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          guests_count: form.guests_count ? Number(form.guests_count) : null,
          price_total: form.price_total ? Number(form.price_total) : null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        onToast(j.message || 'Не вдалося зберегти.');
        setBusy(false);
        return;
      }
      onSaved();
    } catch {
      onToast('Помилка мережі.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Нове бронювання" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, color: '#6E6E73' }}>Тип події *</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {Object.entries(EVENT_TYPES).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm({ ...form, event_type: k })}
                style={{
                  ...ghostBtn,
                  padding: '8px 14px',
                  fontSize: 13,
                  background: form.event_type === k ? '#1D1D1F' : '#fff',
                  color: form.event_type === k ? '#fff' : '#1D1D1F',
                  borderColor: form.event_type === k ? '#1D1D1F' : '#D2D2D7',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ fontSize: 13, color: '#6E6E73' }}>
          Дата події *
          <input
            type="date"
            value={form.event_date}
            onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            style={{ ...fieldStyle, marginTop: 4 }}
          />
        </label>

        <div style={{ fontSize: 12, color: '#86868B' }}>
          Цього достатньо, щоб зберегти. Решту можна дозаповнити згодом.
        </div>

        {!more ? (
          <button onClick={() => setMore(true)} style={{ ...ghostBtn, width: '100%' }}>
            Додати деталі
          </button>
        ) : (
          <>
            {role === 'superadmin' && (
              <>
                <label style={{ fontSize: 13, color: '#6E6E73' }}>
                  Клієнт
                  <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 13, color: '#6E6E73' }}>
                  Телефон
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 13, color: '#6E6E73' }}>
                  Вартість, ₴
                  <input type="number" value={form.price_total} onChange={(e) => setForm({ ...form, price_total: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }} />
                </label>
              </>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, fontSize: 13, color: '#6E6E73' }}>
                Гостей
                <input type="number" value={form.guests_count} onChange={(e) => setForm({ ...form, guests_count: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }} />
              </label>
              <label style={{ flex: 1, fontSize: 13, color: '#6E6E73' }}>
                Майданчик
                <select value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }}>
                  <option value="">—</option>
                  {VENUES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ fontSize: 13, color: '#6E6E73' }}>
              Нотатки
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...fieldStyle, marginTop: 4, minHeight: 70, resize: 'vertical' }} />
            </label>
          </>
        )}

        <label style={{ fontSize: 13, color: '#6E6E73' }}>
          Хто вніс
          <input value={form.created_by_name} onChange={(e) => setForm({ ...form, created_by_name: e.target.value })} placeholder="Ваше імʼя" style={{ ...fieldStyle, marginTop: 4 }} />
        </label>

        <button onClick={save} disabled={busy} style={{ ...primaryBtnFull, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Зберігаю…' : 'Зберегти'}
        </button>
      </div>
    </Modal>
  );
}

// ── Картка бронювання ──────────────────────────────────────────────
function BookingDetail({
  b,
  role,
  defaultName,
  onClose,
  onChanged,
  onToast,
}: {
  b: Booking;
  role: Role;
  defaultName: string;
  onClose: () => void;
  onChanged: () => void;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'готівка', taken_by_name: defaultName, note: '' });
  const [payments, setPayments] = useState<{ id: string; amount: number; kind: string; taken_by_name: string | null; paid_at: string }[]>([]);

  useEffect(() => {
    if (role !== 'superadmin') return;
    fetch(`/api/events/payments?booking_id=${b.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setPayments(j.payments || []))
      .catch(() => undefined);
  }, [b.id, role]);

  const setStatus = async (status: string) => {
    setBusy(true);
    const r = await fetch(`/api/events/bookings/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (r.ok) {
      onToast('Статус змінено');
      onChanged();
    } else onToast('Не вдалося змінити статус.');
  };

  const addPayment = async () => {
    const amount = Number(pay.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      onToast('Вкажіть суму.');
      return;
    }
    setBusy(true);
    const r = await fetch('/api/events/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: b.id, amount, method: pay.method, taken_by_name: pay.taken_by_name, note: pay.note }),
    });
    setBusy(false);
    if (r.ok) {
      onToast('Завдаток записано');
      onChanged();
    } else onToast('Не вдалося записати.');
  };

  return (
    <Modal title={`${EVENT_TYPES[b.event_type] || b.event_type} · ${b.code}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Row k="Дата" v={fmtDate(b.event_date) + (b.end_date ? ` → ${fmtDate(b.end_date)}` : '')} />
        {b.venue && <Row k="Майданчик" v={b.venue} />}
        {b.guests_count ? <Row k="Гостей" v={String(b.guests_count)} /> : null}
        <Row k="Статус" v={EVENT_STATUSES[b.status] || b.status} />

        {role === 'superadmin' ? (
          <>
            {b.client_name && <Row k="Клієнт" v={b.client_name} />}
            {b.phone && <Row k="Телефон" v={b.phone} />}
            {b.email && <Row k="Пошта" v={b.email} />}
            {b.price_total ? <Row k="Вартість" v={`${b.price_total.toLocaleString('uk-UA')} ₴`} /> : null}
            {b.notes && <Row k="Нотатки" v={b.notes} />}
          </>
        ) : (
          <div style={{ background: '#FDF6E7', border: '1px solid #EAD9AE', borderRadius: 10, padding: 12, fontSize: 13 }}>
            Контактні дані та суми доступні супер-адміністратору.
            {b.has_deposit ? ' Завдаток за цим бронюванням внесено.' : ' Завдаток ще не внесено.'}
          </div>
        )}

        {b.created_by_name && <Row k="Вніс" v={`${b.created_by_name} · ${new Date(b.created_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}`} />}

        {role === 'superadmin' && payments.length > 0 && (
          <div style={{ borderTop: '1px solid #F0F0F2', paddingTop: 10 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Платежі</div>
            {payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
                <span>{p.taken_by_name || '—'} · {new Date(p.paid_at).toLocaleDateString('uk-UA')}</span>
                <strong>{p.amount.toLocaleString('uk-UA')} ₴</strong>
              </div>
            ))}
          </div>
        )}

        {/* Дії */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {b.status !== 'confirmed' && (
            <button onClick={() => setStatus('confirmed')} disabled={busy} style={{ ...ghostBtn, flex: 1, background: '#E4F0E6', borderColor: '#B7DFC2', color: '#3B9B4E' }}>
              Підтвердити
            </button>
          )}
          {b.status !== 'cancelled' && (
            <button onClick={() => setStatus('cancelled')} disabled={busy} style={{ ...ghostBtn, flex: 1, background: '#FDECEC', borderColor: '#F0C9C9', color: '#C0392B' }}>
              Скасувати
            </button>
          )}
        </div>

        {!payOpen ? (
          <button onClick={() => setPayOpen(true)} style={{ ...ghostBtn, width: '100%' }}>
            Внести завдаток
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 8, borderTop: '1px solid #F0F0F2', paddingTop: 10 }}>
            <input type="number" placeholder="Сума, ₴" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} style={fieldStyle} />
            <input placeholder="Спосіб (готівка / картка)" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} style={fieldStyle} />
            <input placeholder="Хто прийняв" value={pay.taken_by_name} onChange={(e) => setPay({ ...pay, taken_by_name: e.target.value })} style={fieldStyle} />
            <button onClick={addPayment} disabled={busy} style={primaryBtnFull}>
              {busy ? 'Записую…' : 'Записати завдаток'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Календар ───────────────────────────────────────────────────────
function CalendarView({
  bookings,
  offset,
  setOffset,
  onOpen,
}: {
  bookings: Booking[];
  offset: number;
  setOffset: (f: (n: number) => number) => void;
  onOpen: (b: Booking) => void;
}) {
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();

  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const arr = byDate.get(b.event_date) || [];
    arr.push(b);
    byDate.set(b.event_date, arr);
  }

  const cells: { day: number | null; ds: string; items: Booking[] }[] = [];
  for (let i = 0; i < lead; i++) cells.push({ day: null, ds: '', items: [] });
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, ds, items: byDate.get(ds) || [] });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setOffset((n) => n - 1)} style={ghostBtn}>‹</button>
        <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600 }}>{MONTHS[month]} {year}</div>
        <button onClick={() => setOffset((n) => n + 1)} style={ghostBtn}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {WD.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, color: '#86868B', paddingBottom: 6 }}>{w}</div>
        ))}
        {cells.map((c, i) =>
          c.day === null ? (
            <div key={`e${i}`} />
          ) : (
            <div
              key={c.day}
              style={{
                minHeight: 74,
                border: `1px solid ${c.items.length ? '#C9C9CF' : '#E8E8ED'}`,
                borderRadius: 10,
                padding: 6,
                background: c.items.length ? '#F0F0F2' : '#FAFAFB',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.day}</div>
              {c.items.slice(0, 2).map((b) => (
                <div
                  key={b.id}
                  onClick={() => onOpen(b)}
                  title={EVENT_TYPES[b.event_type]}
                  style={{
                    fontSize: 10,
                    marginTop: 3,
                    padding: '2px 5px',
                    borderRadius: 5,
                    background: b.status === 'confirmed' ? '#1D1D1F' : '#B7791F',
                    color: '#fff',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {EVENT_TYPES[b.event_type] || b.event_type}
                </div>
              ))}
              {c.items.length > 2 && (
                <div style={{ fontSize: 10, color: '#86868B', marginTop: 2 }}>ще {c.items.length - 2}</div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ── Зустрічі ───────────────────────────────────────────────────────
function AppointmentsView({
  list,
  bookings,
  defaultName,
  onChanged,
  onToast,
}: {
  list: Appointment[];
  bookings: Booking[];
  defaultName: string;
  onChanged: () => void;
  onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', starts_at: '', place: '', booking_id: '', notes: '', created_by_name: defaultName });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.starts_at) {
      onToast('Вкажіть назву й час.');
      return;
    }
    setBusy(true);
    const r = await fetch('/api/events/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, starts_at: new Date(form.starts_at).toISOString() }),
    });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setForm({ title: '', starts_at: '', place: '', booking_id: '', notes: '', created_by_name: defaultName });
      onChanged();
      onToast('Зустріч додано');
    } else onToast('Не вдалося зберегти.');
  };

  const toggle = async (a: Appointment) => {
    await fetch('/api/events/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, done: !a.done }),
    });
    onChanged();
  };

  return (
    <div>
      <button onClick={() => setOpen(true)} style={{ ...ghostBtn, marginBottom: 14 }}>
        + Додати зустріч
      </button>

      {list.length === 0 ? (
        <Empty text="Зустрічей ще немає. Тут плануються дегустації меню, узгодження оформлення, підписання договорів." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((a) => (
            <div key={a.id} style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, opacity: a.done ? 0.55 : 1 }}>
              <div>
                <div style={{ fontWeight: 500, textDecoration: a.done ? 'line-through' : 'none' }}>{a.title}</div>
                <div style={{ fontSize: 13, color: '#6E6E73', marginTop: 2 }}>
                  {new Date(a.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}
                  {a.place ? ` · ${a.place}` : ''}
                </div>
                {a.created_by_name && <div style={{ fontSize: 11, color: '#A0A0A5', marginTop: 2 }}>вніс: {a.created_by_name}</div>}
              </div>
              <button onClick={() => toggle(a)} style={{ ...ghostBtn, padding: '8px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>
                {a.done ? 'Відновити' : 'Виконано'}
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Нова зустріч" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input placeholder="Напр. Дегустація меню" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={fieldStyle} />
            <label style={{ fontSize: 13, color: '#6E6E73' }}>
              Дата й час
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }} />
            </label>
            <input placeholder="Місце" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} style={fieldStyle} />
            <label style={{ fontSize: 13, color: '#6E6E73' }}>
              Повʼязати з подією
              <select value={form.booking_id} onChange={(e) => setForm({ ...form, booking_id: e.target.value })} style={{ ...fieldStyle, marginTop: 4 }}>
                <option value="">— без звʼязку —</option>
                {bookings.filter((b) => b.status !== 'cancelled').map((b) => (
                  <option key={b.id} value={b.id}>
                    {EVENT_TYPES[b.event_type]} · {fmtDate(b.event_date)} · {b.code}
                  </option>
                ))}
              </select>
            </label>
            <input placeholder="Хто вніс" value={form.created_by_name} onChange={(e) => setForm({ ...form, created_by_name: e.target.value })} style={fieldStyle} />
            <button onClick={save} disabled={busy} style={primaryBtnFull}>
              {busy ? 'Зберігаю…' : 'Зберегти'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Звіти (лише супер-адмін) ───────────────────────────────────────
function ReportsView({ bookings }: { bookings: Booking[] }) {
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const year = new Date().getFullYear();

  const byType = Object.entries(EVENT_TYPES).map(([k, label]) => {
    const list = active.filter((b) => b.event_type === k);
    return { label, count: list.length, sum: list.reduce((s, b) => s + (b.price_total || 0), 0) };
  }).filter((r) => r.count > 0);

  const byMonth = MONTHS.map((name, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
    const list = active.filter((b) => b.event_date.startsWith(mk));
    return { name, count: list.length, sum: list.reduce((s, b) => s + (b.price_total || 0), 0) };
  }).filter((r) => r.count > 0);

  const total = active.reduce((s, b) => s + (b.price_total || 0), 0);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <Stat value={String(active.length)} label="подій усього" />
        <Stat value={`${total.toLocaleString('uk-UA')} ₴`} label="сума договорів" />
        <Stat value={String(active.filter((b) => b.status === 'confirmed').length)} label="підтверджених" />
      </div>

      <Section title={`За типом подій`}>
        {byType.map((r) => (
          <Line key={r.label} left={r.label} right={`${r.count} · ${r.sum.toLocaleString('uk-UA')} ₴`} />
        ))}
      </Section>

      <Section title={`По місяцях · ${year}`}>
        {byMonth.length === 0 ? (
          <div style={{ padding: 16, color: '#86868B' }}>Даних за цей рік ще немає.</div>
        ) : (
          byMonth.map((r) => (
            <Line key={r.name} left={r.name} right={`${r.count} · ${r.sum.toLocaleString('uk-UA')} ₴`} />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: 8 }}>{title}</div>
      <div style={{ background: '#fff', border: '1px solid #E8E8ED', borderRadius: 14, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #F0F0F2', fontSize: 14 }}>
      <span>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, fontSize: 14, padding: '5px 0' }}>
      <span style={{ color: '#86868B', fontSize: 13 }}>{k}</span>
      <span style={{ wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.38)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', padding: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: '#F5F5F7', width: 32, height: 32, minWidth: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 20, color: '#6E6E73' }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
