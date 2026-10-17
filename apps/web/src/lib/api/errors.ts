/**
 * Failure types from the catalog API.
 *
 * The distinction that matters is "this resource does not exist" versus
 * "something went wrong". The first is a normal, expected outcome that Next
 * renders as a 404 page; the second must reach error.tsx. Collapsing them —
 * returning `null` for both and letting the page render an empty shell — is the
 * failure mode this file exists to prevent: a page that looks fine and says
 * nothing is worse than one that admits it broke.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

/** The API answered 404. Callers turn this into Next's notFound(). */
export class ApiNotFoundError extends ApiError {
  constructor(url: string, message: string) {
    super(404, url, message);
    this.name = 'ApiNotFoundError';
  }
}

/** The API was unreachable — wrong URL, not running, DNS, timeout. */
export class ApiUnreachableError extends ApiError {
  constructor(url: string, cause: unknown) {
    super(
      0,
      url,
      `Could not reach the Packvio API at ${url}. Is it running, and is ` +
        `NEXT_PUBLIC_API_URL correct? Start it with \`npm run dev:api\`.`,
      { cause },
    );
    this.name = 'ApiUnreachableError';
  }
}

export function isNotFound(error: unknown): error is ApiNotFoundError {
  return error instanceof ApiNotFoundError;
}
