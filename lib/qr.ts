import qrcode from 'qrcode-generator';

/**
 * Матриця QR-коду: true = темний модуль.
 * Використовується і для PDF (малюємо прямокутниками), і для екрана (SVG),
 * щоб код був той самий в обох місцях.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M'); // 0 = автопідбір версії, 'M' = середній рівень корекції
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}
