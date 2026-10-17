import { Container } from '@/components/ui';

/**
 * Route-level loading state.
 *
 * A skeleton shaped like the page that is coming, not a spinner: the header and
 * footer are already painted by the layout, so a centred spinner between them
 * reads as "the site is broken" rather than "the content is a moment away".
 *
 * Every block has a fixed height, so the skeleton occupies exactly the space the
 * real content will and nothing jumps when it swaps in.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Hero */}
      <div className="bg-brand-purple">
        <Container className="py-2xl sm:py-3xl">
          <div className="max-w-[46rem] animate-pulse">
            <div className="h-4 w-32 rounded-sm bg-surface/20" />
            <div className="mt-4 h-12 w-full rounded-md bg-surface/20" />
            <div className="mt-3 h-12 w-3/4 rounded-md bg-surface/20" />
            <div className="mt-5 h-6 w-2/3 rounded-sm bg-surface/15" />
            <div className="mt-lg flex gap-3">
              <div className="h-12 w-40 rounded-md bg-surface/20" />
              <div className="h-12 w-40 rounded-md bg-surface/15" />
            </div>
          </div>
        </Container>
      </div>

      {/* Category tiles */}
      <Container className="py-2xl">
        <div className="h-8 w-64 animate-pulse rounded-md bg-surface-alt" />
        <ul className="mt-lg grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="h-36 animate-pulse rounded-lg bg-panel panel-inset" />
          ))}
        </ul>
      </Container>

      {/* Product rail */}
      <Container className="pb-2xl">
        <div className="h-8 w-56 animate-pulse rounded-md bg-surface-alt" />
        <ul className="mt-lg grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="animate-pulse">
              <div className="aspect-square rounded-lg bg-panel panel-inset" />
              <div className="mt-3 h-4 w-3/4 rounded-sm bg-surface-alt" />
              <div className="mt-2 h-3 w-1/3 rounded-sm bg-surface-alt" />
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
