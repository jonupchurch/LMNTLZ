import { useState } from 'react';
import { SiteFooter } from './components/SiteFooter.js';
import { LandingScreen } from './features/landing/LandingScreen.js';
import { SquadsScreen } from './features/squads/SquadsScreen.js';

/**
 * The app shell.
 *
 * Feature 006 owns the only screen there is. Routing arrives with feature 007,
 * which is the first feature to have somewhere else to go.
 *
 * **The footer sits outside the screen rather than inside it**, because the
 * policy links have to be on every screen 007–016 adds — including the ones that
 * do not exist yet. Putting it in `SquadsScreen` would make that a thing to
 * remember, and the day it is forgotten is the day the refund link disappears.
 */
export function App() {
  /**
   * **Optimistic, and deliberately so.** The app attempts the roster first and
   * falls back to the landing page when the server says 401, rather than
   * checking for a session and then fetching. A signed-in player therefore pays
   * no extra round trip to reach their squads, and a visitor pays one 401 to
   * reach a static page — which is the right way round.
   *
   * It also means the squad screen stays reachable the moment sign-in exists,
   * with no routing to revisit.
   */
  const [anonymous, setAnonymous] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        {anonymous ? (
          <LandingScreen />
        ) : (
          <SquadsScreen onUnauthenticated={() => setAnonymous(true)} />
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
