'use client';

import type { ReactNode } from 'react';
import { SERIF } from '@/lib/ui';

const SITE_URL = 'http://www.pidgoretskyymaietok.com';

export default function SiteHeader({
  subtitle,
  right,
}: {
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(251,250,246,.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid #E0D6C8',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <a
          href={SITE_URL}
          style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, textDecoration: 'none', color: 'inherit' }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, letterSpacing: '.5px' }}>
            Підгорецький Маєток
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#9A8C7B',
              marginTop: 2,
            }}
          >
            {subtitle}
          </span>
        </a>
        {right}
      </div>
    </div>
  );
}
