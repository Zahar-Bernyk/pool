// ───────────────────────────────────────────────────────────────
// Розкладка басейну: 40 шезлонгів з фіксованими позиціями (1–40).
// Координати один-в-один з дизайн-прототипу — НЕ змінювати порядок/позиції.
//   left/top — у відсотках всередині контейнера карти.
//   vertical — орієнтація шезлонга (true = вузький/високий, false = широкий/низький).
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

  // Верхній ряд кабанів (світлі): 21–32 — дванадцять вертикальних над басейном
  for (let i = 0; i < 12; i++) add(21 + i, 13 + i * (74 / 11), 13, true);
  // Верхня смуга: 33–40 — вісім вертикальних під кабанами
  for (let i = 0; i < 8; i++) add(33 + i, 14 + i * (42 / 7), 24.5, true);
  // Схід від басейну (праворуч): 1,2,3 (вище, біля парасольки), 4,5,6 (нижче)
  [1, 2, 3].forEach((id, i) => add(id, 72, 38 + i * 5.3, false));
  [4, 5, 6].forEach((id, i) => add(id, 72, 58 + i * 5.3, false));
  // Захід від басейну (ліворуч): 20,19,18 (вище), 17,16,15 (нижче)
  [20, 19, 18].forEach((id, i) => add(id, 16, 38 + i * 5.3, false));
  [17, 16, 15].forEach((id, i) => add(id, 16, 58 + i * 5.3, false));
  // Південний ряд (низ): 14,13,12,11,10,9,8,7 (зліва→направо) — вертикальні
  [14, 13, 12, 11, 10, 9, 8, 7].forEach((id, i) =>
    add(id, 32 + i * (38 / 7), 75, true)
  );

  return a;
}

export const SPOTS: SpotCoord[] = buildCoords();
export const TOTAL_SPOTS = SPOTS.length; // 40

/** Усі коректні номери шезлонгів (для валідації на сервері). */
export const VALID_SPOT_IDS = new Set(SPOTS.map((s) => s.id));
