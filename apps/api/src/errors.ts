/**
 * The one JSON error body every route in every feature returns.
 *
 * Sixteen features of endpoints and one error path on the client. `code` is
 * stable, machine-readable and `snake_case` — clients branch on it; `message` is
 * human-readable, safe to display, and **never carries internal detail.**
 */

export interface ApiError {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export const apiError = (code: string, message: string): ApiError => ({
  error: { code, message },
});
