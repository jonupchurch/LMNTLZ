import { SiteFooter } from './components/SiteFooter.js';
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
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        <SquadsScreen />
      </div>
      <SiteFooter />
    </div>
  );
}
