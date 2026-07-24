// ───────────────────────────────────────────────────────────────
// Розкладка басейну — 52 лежаки. Координати у % (0–100).
//   vertical — орієнтація (true = вузький/високий, false = широкий/низький).
// Праву частину звільнено (без будиночків/бару) — лежаки розсунуто ширше.
// ───────────────────────────────────────────────────────────────

export interface SpotCoord {
  id: number;
  left: number; // %
  top: number; // %
  vertical: boolean;
}

function buildCoords(): SpotCoord[] {
  const a: SpotCoord[] = [];
  const add = (id: number, left: number, top: number, vertical: boolean) =>
    a.push({ id, left, top, vertical });

  // Верхній ряд під навісом: 21–32 (12 вертикальних) — розтягнуто на всю ширину
  for (let i = 0; i < 12; i++) add(21 + i, 24 + (i * (92 - 24)) / 11, 12, true);
  // Другий ряд: 33–40 (8 вертикальних)
  for (let i = 0; i < 8; i++) add(33 + i, 26 + (i * (64 - 26)) / 7, 23, true);

  // Праворуч від басейну: 1,2,3 / 4,5,6 — горизонтальні
  [1, 2, 3].forEach((id, i) => add(id, 66, 36 + i * 4.6, false));
  [4, 5, 6].forEach((id, i) => add(id, 66, 55 + i * 4.6, false));
  // Ліворуч від басейну: 20,19,18 / 17,16,15 — горизонтальні
  [20, 19, 18].forEach((id, i) => add(id, 36, 36 + i * 4.6, false));
  [17, 16, 15].forEach((id, i) => add(id, 36, 55 + i * 4.6, false));

  // Нижній ряд: 14→7 (зліва направо) — 8 вертикальних
  for (let i = 0; i < 8; i++) add(14 - i, 38 + (i * (66 - 38)) / 7, 71, true);

  // Далеко ліворуч, верхній блок
  [48, 47].forEach((id, i) => add(id, 16, 37 + i * 5, false));
  [46, 45].forEach((id, i) => add(id, 16, 48 + i * 5, false));
  [52, 51].forEach((id, i) => add(id, 5, 40 + i * 5, false));
  // Далеко ліворуч, нижній блок
  [44, 43, 42, 41].forEach((id, i) => add(id, 16, 61 + i * 5, false));
  [50, 49].forEach((id, i) => add(id, 5, 65 + i * 5, false));

  return a.sort((x, y) => x.id - y.id);
}

export const SPOTS: SpotCoord[] = buildCoords();
export const TOTAL_SPOTS = SPOTS.length; // 52
export const VALID_SPOT_IDS = new Set(SPOTS.map((s) => s.id));
export const CANOPY_SPOTS = new Set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
