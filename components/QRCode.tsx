'use client';

import { useMemo } from 'react';
import { qrMatrix } from '@/lib/qr';

/**
 * QR-код у вигляді SVG — той самий код, що у Wallet-квитку.
 * Векторний, тож чіткий і на екрані, і при друку.
 */
export default function QRCode({ value, size = 150 }: { value: string; size?: number }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const n = matrix.length;
  const pad = 2; // «тиха зона» в модулях — потрібна для надійного сканування
  const total = n + pad * 2;

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR-код бронювання ${value}`}
    >
      <rect width={total} height={total} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? <rect key={`${r}-${c}`} x={c + pad} y={r + pad} width={1} height={1} fill="#1D1D1F" /> : null,
        ),
      )}
    </svg>
  );
}
