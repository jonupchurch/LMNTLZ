import { SquadsScreen } from './features/squads/SquadsScreen.js';

/**
 * The app shell.
 *
 * Feature 006 owns the only screen there is. Routing arrives with feature 007,
 * which is the first feature to have somewhere else to go.
 */
export function App() {
  return <SquadsScreen />;
}
