'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Route-level error boundary.
 *
 * COPY IS HARDCODED HERE, IN BOTH LANGUAGES, and that is deliberate — it is the
 * one place in the app where the "all strings come from messages/*.json" rule is
 * the wrong rule. This component renders precisely when something upstream
 * failed, and one of the things that can fail is loading the message bundle. A
 * translated error page that itself throws because `useTranslations` has nothing
 * to read leaves the reader with a blank screen instead of a way out.
 *
 * Showing both languages also removes the need to know which locale we are in —
 * which, if the routing segment is what broke, we may not.
 *
 * No stack trace, no error message: the reader cannot act on either, and both
 * leak implementation detail to the public internet. The digest is shown because
 * it is the one string that lets support correlate this page with a server log.
 */
export default function LocaleError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Reaches the browser console in development and any client error reporter
    // wired up later; never rendered.
    console.error('[packvio] Unhandled error rendering page:', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-page flex-col items-center gap-lg px-4 py-3xl text-center sm:px-6">
      <div className="flex flex-col gap-2" dir="rtl" lang="ar">
        <h1 className="text-h1 font-semibold text-brand-purple">حدث خطأ غير متوقع</h1>
        <p className="text-body text-ink-muted">
          نعتذر عن ذلك. تعذّر تحميل هذه الصفحة. جرّب مرة أخرى، أو عد إلى الصفحة الرئيسية.
        </p>
      </div>

      <div aria-hidden="true" className="h-px w-24 bg-border" />

      <div className="flex flex-col gap-2" dir="ltr" lang="en">
        <h2 className="text-h1 font-semibold text-brand-purple">Something went wrong</h2>
        <p className="text-body text-ink-muted">
          Sorry about that — this page could not be loaded. Try again, or head back to the home page.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-md border border-brand-cyan bg-brand-cyan px-5 py-2.5 text-body font-medium text-ink transition-colors hover:border-brand-purple hover:bg-brand-purple hover:text-surface"
        >
          <span lang="ar">إعادة المحاولة</span>
          <span aria-hidden="true"> · </span>
          <span lang="en">Try again</span>
        </button>

        {/*
          A plain <a>, not next-intl's Link: this boundary can render when the
          locale segment is exactly what failed, and Link would need a working
          routing context to build an href. `/` always resolves — the middleware
          sends it to /ar.
        */}
        <a
          href="/"
          className="rounded-md border border-brand-purple px-5 py-2.5 text-body font-medium text-brand-purple transition-colors hover:bg-brand-purple hover:text-surface"
        >
          <span lang="ar">الصفحة الرئيسية</span>
          <span aria-hidden="true"> · </span>
          <span lang="en">Home</span>
        </a>
      </div>

      {error.digest && (
        <p className="font-mono text-caption text-ink-muted">
          <span className="bidi-latin">ref: {error.digest}</span>
        </p>
      )}
    </div>
  );
}
