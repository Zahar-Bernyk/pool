// ───────────────────────────────────────────────────────────────
// Розкладка басейну — оновлена схема (52 лежаки).
//   left/top — у відсотках всередині контейнера карти (0–100).
//   vertical — орієнтація лежака (true = вузький/високий, false = широкий/низький).
// Групи (за новим планом):
//   • 21–32 — верхній ряд ПІД НАВІСОМ (вертикальні)
//   • 33–40 — другий ряд (вертикальні)
//   • 1–6   — праворуч від басейну (горизонтальні)
//   • 15–20 — ліворуч від басейну (горизонтальні)
//   • 7–14  — нижній ряд (вертикальні)
//   • 41–52 — далеко ліворуч (горизонтальні)
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

  // Верхній ряд під навісом: 21–32 (12 вертикальних)
  for (let i = 0; i < 12; i++) add(21 + i, 33 + (i * (65 - 33)) / 11, 11.5, true);
  // Другий ряд: 33–40 (8 вертикальних)
  for (let i = 0; i < 8; i++) add(33 + i, 34 + (i * (54 - 34)) / 7, 22.5, true);

  // Праворуч від басейну: 1,2,3 (верх) та 4,5,6 (низ) — горизонтальні
  [1, 2, 3].forEach((id, i) => add(id, 63, 34 + i * 4.6, false));
  [4, 5, 6].forEach((id, i) => add(id, 63, 54 + i * 4.6, false));
  // Ліворуч від басейну: 20,19,18 (верх) та 17,16,15 (низ) — горизонтальні
  [20, 19, 18].forEach((id, i) => add(id, 37, 34 + i * 4.6, false));
  [17, 16, 15].forEach((id, i) => add(id, 37, 54 + i * 4.6, false));

  // Нижній ряд: 14→7 (зліва направо) — 8 вертикальних
  for (let i = 0; i < 8; i++) add(14 - i, 41 + (i * (59 - 41)) / 7, 70, true);

  // Далеко ліворуч, верхній блок
  [48, 47].forEach((id, i) => add(id, 18, 37 + i * 5, false));
  [46, 45].forEach((id, i) => add(id, 18, 48 + i * 5, false));
  [52, 51].forEach((id, i) => add(id, 6, 40 + i * 5, false));
  // Далеко ліворуч, нижній блок
  [44, 43, 42, 41].forEach((id, i) => add(id, 18, 61 + i * 5, false));
  [50, 49].forEach((id, i) => add(id, 6, 65 + i * 5, false));

  return a.sort((x, y) => x.id - y.id);
}

export const SPOTS: SpotCoord[] = buildCoords();
export const TOTAL_SPOTS = SPOTS.length; // 52

export const VALID_SPOT_IDS = new Set(SPOTS.map((s) => s.id));

// Лежаки під навісом (для позначки на карті).
export const CANOPY_SPOTS = new Set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
