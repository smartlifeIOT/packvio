'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Last-resort boundary, for a failure inside the locale LAYOUT itself.
 *
 * `[locale]/error.tsx` sits inside that layout, so it cannot catch the layout
 * throwing — which is exactly what happens if the catalog API is unreachable
 * when the header's category fetch runs. Without this file the reader would get
 * Next's unstyled default error screen.
 *
 * It has to render its own <html> and <body>, because it REPLACES the root
 * layout rather than nesting inside it. That also means no fonts, no design
 * tokens and no message bundle are available here, so the styles are inline and
 * the copy is bilingual and hardcoded, for the same reasons as error.tsx.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[packvio] Unhandled error in the root layout:', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          background: '#ffffff',
          color: '#1b1b1f',
        }}
      >
        <main style={{ maxWidth: '34rem', padding: '2rem', textAlign: 'center' }}>
          <div dir="rtl" lang="ar">
            <h1 style={{ color: '#39255f', fontSize: '1.75rem', margin: '0 0 0.5rem' }}>
              الموقع غير متاح مؤقتاً
            </h1>
            <p style={{ color: '#5a5a66', margin: 0 }}>
              نعتذر عن ذلك. نعمل على إصلاح المشكلة، يرجى المحاولة بعد قليل.
            </p>
          </div>

          <hr
            style={{
              border: 0,
              borderTop: '1px solid #e3e8ef',
              width: '6rem',
              margin: '1.5rem auto',
            }}
          />

          <div dir="ltr" lang="en">
            <h2 style={{ color: '#39255f', fontSize: '1.75rem', margin: '0 0 0.5rem' }}>
              The site is temporarily unavailable
            </h2>
            <p style={{ color: '#5a5a66', margin: 0 }}>
              Sorry about that. We are working on it — please try again shortly.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              cursor: 'pointer',
              border: '1px solid #4fc0df',
              background: '#4fc0df',
              color: '#1b1b1f',
              borderRadius: '10px',
              padding: '0.65rem 1.25rem',
              font: 'inherit',
              fontWeight: 500,
            }}
          >
            إعادة المحاولة · Try again
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: '1rem',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                color: '#5a5a66',
                direction: 'ltr',
              }}
            >
              ref: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
