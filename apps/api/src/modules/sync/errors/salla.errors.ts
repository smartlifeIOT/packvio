/**
 * Typed failures the Salla integration can produce. Callers branch on the class,
 * not on string matching against a message.
 *
 * None of these ever carry a token value — including in `cause`. Anything that
 * builds a message here must assume it will end up in a log aggregator.
 */

/** No token row for the store at all: the app was never installed. */
export class SallaNotConnectedError extends Error {
  constructor(readonly storeId?: string) {
    super(
      storeId
        ? `No Salla token stored for store ${storeId}. The app has not been installed.`
        : 'No Salla store is connected. Install the app from the Salla Partners dashboard.',
    );
    this.name = 'SallaNotConnectedError';
  }
}

/**
 * The refresh token is dead — revoked, already used, or the merchant uninstalled.
 * Nothing the process can do about it: a human must reinstall the app.
 */
export class SallaReauthorizationRequiredError extends Error {
  constructor(
    readonly storeId: string,
    readonly reason: string,
  ) {
    super(
      `Salla authorization for store ${storeId} is no longer valid (${reason}). ` +
        `The app must be reinstalled from the Salla dashboard to issue a new token.`,
    );
    this.name = 'SallaReauthorizationRequiredError';
  }
}

/** A Salla API call failed after the retry policy was exhausted. */
export class SallaApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number | undefined,
    readonly attempts: number,
    message?: string,
  ) {
    super(
      `Salla API ${method} ${path} failed after ${attempts} attempt(s)` +
        `${status === undefined ? '' : ` with status ${status}`}${message ? `: ${message}` : ''}`,
    );
    this.name = 'SallaApiError';
  }
}
