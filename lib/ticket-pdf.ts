// Генерація PDF-квитка у браузері (без зовнішніх сервісів).
// jsPDF і шрифт вантажаться динамічно — лише коли користувач натискає «Завантажити PDF»,
// щоб не збільшувати початкове завантаження сторінки.

import { qrMatrix } from './qr';

export interface TicketRow {
  label: string;
  value: string;
}

export interface TicketData {
  /** Підзаголовок: «Басейн · Електронний квиток» тощо. */
  subtitle: string;
  /** Код бронювання, напр. 'PM-1234'. */
  code: string;
  rows: TicketRow[];
  amount: number;
  /** Підказка внизу квитка. */
  note?: string;
}

const INK: [number, number, number] = [29, 29, 31];
const GREY: [number, number, number] = [134, 134, 139];
const LINE: [number, number, number] = [225, 225, 230];
const GREEN: [number, number, number] = [59, 155, 78];

export async function downloadTicketPdf(data: TicketData): Promise<void> {
  const [{ jsPDF }, font] = await Promise.all([import('jspdf'), import('./pdf-font')]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Вбудовуємо шрифт із кирилицею (стандартні шрифти PDF її не мають).
  doc.addFileToVFS('PMSans.ttf', font.PDF_FONT_REGULAR);
  doc.addFont('PMSans.ttf', 'PMSans', 'normal');
  doc.addFileToVFS('PMSans-Bold.ttf', font.PDF_FONT_BOLD);
  doc.addFont('PMSans-Bold.ttf', 'PMSans', 'bold');

  const W = 210;
  const M = 20; // поля
  const CW = W - M * 2; // ширина контенту
  const cx = W / 2;

  // ── Шапка ────────────────────────────────────────────────────────────
  doc.setFont('PMSans', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text('ПІДГОРЕЦЬКИЙ МАЄТОК', cx, 26, { align: 'center' });

  doc.setFont('PMSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text(data.subtitle, cx, 33, { align: 'center' });

  // ── Картка квитка ────────────────────────────────────────────────────
  const cardTop = 43;
  const rowH = 9;
  const qrSide = 34; // мм
  const cardH = 42 + data.rows.length * rowH + 22 + qrSide + 14;

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, cardTop, CW, cardH, 4, 4, 'S');

  // Код бронювання
  let y = cardTop + 13;
  doc.setFont('PMSans', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('КОД БРОНЮВАННЯ', cx, y, { align: 'center' });

  y += 11;
  doc.setFont('PMSans', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(data.code, cx, y, { align: 'center' });

  // Роздільник
  y += 8;
  doc.setDrawColor(...LINE);
  doc.line(M + 8, y, W - M - 8, y);

  // ── Рядки деталей ────────────────────────────────────────────────────
  y += 9;
  const labelX = M + 8;
  const valueX = W - M - 8;

  for (const r of data.rows) {
    doc.setFont('PMSans', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GREY);
    doc.text(r.label, labelX, y);

    doc.setFont('PMSans', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    // Довгі значення обрізаємо по ширині, щоб не налазили на підпис
    const maxW = CW - 16 - doc.getTextWidth(r.label) - 6;
    const lines = doc.splitTextToSize(r.value, Math.max(maxW, 40)) as string[];
    doc.text(lines[0], valueX, y, { align: 'right' });

    y += rowH;
  }

  // ── Сума ─────────────────────────────────────────────────────────────
  y += 1;
  doc.setDrawColor(...LINE);
  doc.line(M + 8, y, W - M - 8, y);

  y += 10;
  doc.setFont('PMSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text('Сплачено', labelX, y);

  doc.setFont('PMSans', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...GREEN);
  doc.text(`${data.amount} ₴`, valueX, y, { align: 'right' });

  // ── QR-код (той самий, що у Wallet: код бронювання) ──────────────────
  y += 10;
  const matrix = qrMatrix(data.code);
  const modules = matrix.length;
  const cell = qrSide / modules;
  const qrX = cx - qrSide / 2;
  const qrY = y;

  // Біле тло з «тихою зоною» — щоб сканувалося навіть із кольорового паперу
  doc.setFillColor(255, 255, 255);
  doc.rect(qrX - 3, qrY - 3, qrSide + 6, qrSide + 6, 'F');

  doc.setFillColor(...INK);
  for (let r = 0; r < modules; r++) {
    // Обʼєднуємо сусідні темні модулі в один прямокутник — менший розмір файлу
    let c = 0;
    while (c < modules) {
      if (!matrix[r][c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < modules && matrix[r][c + run]) run++;
      doc.rect(qrX + c * cell, qrY + r * cell, cell * run + 0.02, cell + 0.02, 'F');
      c += run;
    }
  }

  y += qrSide + 7;
  doc.setFont('PMSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('Покажіть цей код на вході', cx, y, { align: 'center' });

  // ── Підвал ───────────────────────────────────────────────────────────
  let fy = cardTop + cardH + 12;
  if (data.note) {
    doc.setFont('PMSans', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(data.note, CW) as string[];
    doc.text(noteLines, cx, fy, { align: 'center' });
    fy += noteLines.length * 5 + 4;
  }

  doc.setFont('PMSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('с. Підгірці, вул. Лесі Українки, 4В · +380 97 030 53 01', cx, fy, { align: 'center' });
  doc.text('pidgoretskyymaietok.com', cx, fy + 5, { align: 'center' });

  doc.save(`${data.code}.pdf`);
}
