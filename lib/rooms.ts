// ───────────────────────────────────────────────────────────────
// Каталог номерів готелю «Підгорецький Маєток» (ПМ Hall Hotel).
// Ціни — грн за добу. Єдине джерело правди (перевіряється на сервері).
// ───────────────────────────────────────────────────────────────

export interface RoomCategory {
  id: string; // slug
  title: string; // назва категорії
  desc: string; // опис (конфігурація ліжок)
  price: number; // грн / добу
  capacity: number; // базова місткість (осіб)
  rooms: number[]; // номери кімнат цієї категорії
}

export const ROOM_CATEGORIES: RoomCategory[] = [
  { id: 'standard-double', title: 'Стандарт', desc: 'спільне двоспальне ліжко', price: 1500, capacity: 2, rooms: [34] },
  { id: 'standard-twin', title: 'Стандарт', desc: '2 окремих односпальних ліжка', price: 1600, capacity: 2, rooms: [33, 43] },
  { id: 'standard-plus-sofa', title: 'Стандарт покращений', desc: 'двоспальне ліжко + крісло-диван', price: 1600, capacity: 3, rooms: [23] },
  { id: 'standard-plus-twin', title: 'Стандарт покращений', desc: '2 окремих односпальних ліжка', price: 1600, capacity: 2, rooms: [21, 31] },
  { id: 'standard-panorama', title: 'Стандарт з панорамним виглядом', desc: 'спільне двоспальне ліжко', price: 1600, capacity: 2, rooms: [44] },
  { id: 'family-lux-terrace', title: 'Сімейний Люкс з терасою', desc: 'двоспальне ліжко + диван', price: 2500, capacity: 4, rooms: [32] },
  { id: 'lux-terrace', title: 'Люкс з терасою', desc: 'спільне двоспальне ліжко', price: 2500, capacity: 2, rooms: [24] },
  { id: 'lux-sofa', title: 'Люкс', desc: 'двоспальне ліжко + крісло-диван', price: 1800, capacity: 3, rooms: [42] },
  { id: 'family-triple', title: 'Сімейний 3-місний', desc: 'двоспальне ліжко + 1 односпальне', price: 2200, capacity: 3, rooms: [41] },
  { id: 'lux-studio', title: 'Люкс студія', desc: 'спільне двоспальне ліжко', price: 2500, capacity: 2, rooms: [22] },
];

// Додаткова постіль — грн/добу.
export const EXTRA_BED_PRICE = 500;

// Усі номери → категорія (для валідації й відображення).
export const ROOM_TO_CATEGORY: Record<number, RoomCategory> = (() => {
  const m: Record<number, RoomCategory> = {};
  for (const c of ROOM_CATEGORIES) for (const r of c.rooms) m[r] = c;
  return m;
})();

export const ALL_ROOMS: number[] = ROOM_CATEGORIES.flatMap((c) => c.rooms).sort((a, b) => a - b);

export function categoryById(id: string): RoomCategory | undefined {
  return ROOM_CATEGORIES.find((c) => c.id === id);
}

// Кількість ночей між заїздом і виїздом (виїзд не включно).
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + 'T00:00:00');
  const b = new Date(checkOut + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// Підсумкова вартість проживання.
export function calcRoomTotal(categoryId: string, nights: number, extraBed: boolean): number {
  const c = categoryById(categoryId);
  if (!c || nights < 1) return 0;
  return c.price * nights + (extraBed ? EXTRA_BED_PRICE * nights : 0);
}
