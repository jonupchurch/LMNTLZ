/**
 * Google Identity Services, loaded on demand.
 *
 * ### The client ID is public, and the server is what verifies
 *
 * `VITE_GOOGLE_CLIENT_ID` is baked into the bundle, which is correct and not a
 * leak: it is an identifier, not a credential. **There is no client secret
 * anywhere in this project** — the server verifies Google's ID tokens against
 * Google's published JWKS rather than running an OAuth code exchange, so
 * nothing signed by us or by Google ever needs to be kept from the browser
 * (`.env.example`, feature 005). `clientSecrecy.test.ts` scans the built bundle
 * and asserts it.
 *
 * ### Loaded lazily, and its absence is a message rather than a crash
 *
 * The script is fetched the first time a player asks to sign in, not on import.
 * A visitor reading the landing page or a policy page never touches Google, and
 * — more usefully — **a failure to load is reportable.** A `<script>` tag in
 * `index.html` that silently does not run leaves a button that does nothing,
 * which is the failure shape this project keeps finding: not broken, just
 * quiet.
 *
 * ### Not used by the Steam build
 *
 * Steam authenticates with a session ticket through `/auth/steam`, which exists
 * and answers `501` until feature 015. This module is web-only and must never
 * become the single sign-in path.
 */

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID: string = import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '';

/** A credential response from GIS. `credential` is the ID token we spend. */
interface CredentialResponse {
  readonly credential?: string;
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'small' | 'medium' | 'large';
          text?: 'signin_with' | 'signup_with' | 'continue_with';
          shape?: 'rectangular' | 'pill';
          width?: number;
        },
      ): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  // `var`, not `const`: TypeScript only attaches a declaration to `globalThis`
  // through a `var` in a global scope. The script assigns this itself.
  var google: GoogleIdentityApi | undefined;
}

export class GoogleUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'GoogleUnavailableError';
  }
}

let loading: Promise<GoogleIdentityApi> | null = null;

/**
 * Fetch the GIS script once and resolve with its API.
 *
 * Single-flight, and **the failed attempt is not cached**: a load that failed
 * because the network was down should be retryable by clicking again, whereas
 * caching the rejection would make the first bad moment permanent for the rest
 * of the page's life.
 */
export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (globalThis.google) return Promise.resolve(globalThis.google);

  loading ??= new Promise<GoogleIdentityApi>((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(
        new GoogleUnavailableError(
          'This build has no Google client ID. Sign-in is unavailable until ' +
            'VITE_GOOGLE_CLIENT_ID is set and the client is rebuilt.',
        ),
      );
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      if (globalThis.google) resolve(globalThis.google);
      else reject(new GoogleUnavailableError('Google sign-in loaded but did not start.'));
    });
    script.addEventListener('error', () =>
      reject(new GoogleUnavailableError('Google sign-in could not be reached.')),
    );

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });

  return loading;
}

/**
 * Render Google's own button into `parent` and call back with an ID token.
 *
 * **Google's rendered button rather than our own.** It is the one part of this
 * interface that is deliberately not styled to match: Google's brand guidelines
 * require it, and a hand-rolled button would also have to reimplement the popup
 * flow, FedCM fallbacks and the account chooser.
 *
 * `auto_select` is off. Signing a returning player straight in without asking
 * is the behaviour that makes people think they cannot sign out.
 */
export async function mountGoogleButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void,
  onError: (message: string) => void,
): Promise<void> {
  const api = await loadGoogleIdentity();

  api.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
      else onError('Google did not return a sign-in token. Try again.');
    },
  });

  api.accounts.id.renderButton(parent, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
  });
}
