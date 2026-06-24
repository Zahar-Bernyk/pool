-- ════════════════════════════════════════════════════════════════════════
--  Підгорецький Маєток — Бронювання шезлонгів
--  Схема бази даних для Supabase (PostgreSQL)
--
--  Як застосувати:
--    Supabase → твій проект → SQL Editor → New query → встав цей файл → Run
-- ════════════════════════════════════════════════════════════════════════

-- ─── Таблиця бронювань ──────────────────────────────────────────────────
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null,
  name        text        not null,
  phone       text        not null default '—',
  date        date        not null,
  session     text        not null check (session in ('day', 'evening')),
  adults      int         not null check (adults >= 0),
  children    int         not null default 0 check (children >= 0),
  kids110     int         not null default 0 check (kids110 >= 0),
  spots       int[]       not null,
  amount      int         not null default 0,
  paid        boolean     not null default false,
  status      text        not null default 'active' check (status in ('active', 'cancelled')),
  created_at  timestamptz not null default now()
);

create index if not exists bookings_date_session_idx
  on public.bookings (date, session);
create index if not exists bookings_status_idx
  on public.bookings (status);

-- ─── Таблиця заблокованих місць (глобально, незалежно від дати) ──────────
create table if not exists public.blocked_spots (
  spot        int primary key check (spot between 1 and 40),
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
--  Атомарне створення бронювання
--  Серіалізує одночасні спроби на той самий (date, session) через advisory
--  lock, перевіряє перетин шезлонгів і блокування, потім вставляє рядок.
--  Гарантує, що один шезлонг не буде заброньовано двічі.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.create_booking(
  p_code     text,
  p_name     text,
  p_phone    text,
  p_date     date,
  p_session  text,
  p_adults   int,
  p_children int,
  p_kids110  int,
  p_spots    int[],
  p_amount   int,
  p_paid     boolean
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.bookings;
  v_taken   int[];
  v_blocked int[];
begin
  if array_length(p_spots, 1) is null then
    raise exception 'NO_SPOTS' using errcode = 'P0001';
  end if;

  -- Серіалізуємо конкурентні бронювання саме цього слоту (дата+сеанс).
  perform pg_advisory_xact_lock(hashtext(p_date::text || '|' || p_session));

  -- Чи перетинаються бажані місця з уже зайнятими (активні брон. цього слоту)?
  select coalesce(array_agg(distinct s), '{}')
    into v_taken
  from public.bookings b, unnest(b.spots) as s
  where b.status = 'active'
    and b.date = p_date
    and b.session = p_session
    and s = any (p_spots);

  if array_length(v_taken, 1) is not null then
    raise exception 'SPOTS_TAKEN:%', array_to_string(v_taken, ',')
      using errcode = 'P0001';
  end if;

  -- Чи є серед бажаних місць заблоковані?
  select coalesce(array_agg(spot), '{}')
    into v_blocked
  from public.blocked_spots
  where spot = any (p_spots);

  if array_length(v_blocked, 1) is not null then
    raise exception 'SPOTS_BLOCKED:%', array_to_string(v_blocked, ',')
      using errcode = 'P0001';
  end if;

  insert into public.bookings
    (code, name, phone, date, session, adults, children, kids110, spots, amount, paid, status)
  values
    (p_code, p_name, coalesce(nullif(p_phone, ''), '—'), p_date, p_session,
     p_adults, p_children, p_kids110, p_spots, p_amount, p_paid, 'active')
  returning * into v_row;

  return v_row;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
--  Row Level Security
--  • Записи клієнтів і перевірка доступності йдуть через серверні роути
--    із service-role ключем (обходить RLS) — тому anon не має прямого доступу.
--  • Авторизовані (персонал) можуть читати бронювання й керувати блокуванням.
-- ════════════════════════════════════════════════════════════════════════
alter table public.bookings      enable row level security;
alter table public.blocked_spots enable row level security;

-- bookings: персонал читає та оновлює (скасування). Вставки/видалення — лише сервер.
drop policy if exists "staff read bookings"   on public.bookings;
drop policy if exists "staff update bookings" on public.bookings;
create policy "staff read bookings"
  on public.bookings for select
  to authenticated using (true);
create policy "staff update bookings"
  on public.bookings for update
  to authenticated using (true) with check (true);

-- blocked_spots: персонал повністю керує.
drop policy if exists "staff manage blocked" on public.blocked_spots;
create policy "staff manage blocked"
  on public.blocked_spots for all
  to authenticated using (true) with check (true);

-- Дозволи на виклик функції.
grant execute on function public.create_booking(
  text, text, text, date, text, int, int, int, int[], int, boolean
) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
--  (Необов'язково) Демо-дані — РОЗКОМЕНТУЙ, якщо хочеш приклади для тесту.
--  У продакшні залиш закоментованим, щоб почати з чистої бази.
-- ════════════════════════════════════════════════════════════════════════
-- insert into public.blocked_spots (spot) values (39), (40)
--   on conflict do nothing;
--
-- insert into public.bookings (code, name, phone, date, session, adults, children, kids110, spots, amount, paid, status) values
--   ('PM-4821', 'Олена Коваль', '097 112 33 44', current_date,            'day',     2, 1, 0, '{5,6}',        1300, true,  'active'),
--   ('PM-4822', 'Андрій Лис',   '063 555 21 09', current_date,            'day',     1, 0, 0, '{12}',          500, true,  'active'),
--   ('PM-4823', 'Марія Сич',    '050 778 90 12', current_date,            'evening', 2, 2, 0, '{23,24}',       900, false, 'active'),
--   ('PM-4824', 'Ігор Дуб',     '098 334 11 76', current_date + 1,        'day',     3, 0, 0, '{1,2,3}',      1500, true,  'active'),
--   ('PM-4810', 'Петро Вовк',   '067 900 12 34', current_date - 1,        'evening', 2, 1, 0, '{7,8}',         750, true,  'active');
