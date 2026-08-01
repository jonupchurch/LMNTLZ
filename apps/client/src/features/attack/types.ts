/**
 * The wire shapes of the matchmaking and scout routes, per
 * `contracts/matchmaking-api.md` and `contracts/squads-api.md`.
 */

export interface Candidate {
  readonly playerId: string;
  readonly username: string;
  /**
   * Served per candidate rather than inferred.
   *
   * A bot is not a lesser opponent — the starter league is authored bots and
   * nothing else, and Bronze is padded with them by design. It is disclosed
   * because a player deciding whether their defense holds should know whether the
   * hold was against a person.
   */
  readonly isBot: boolean;
  readonly rating: number;
  readonly visibleHoldStreak: number;
  readonly hiddenHoldStreak: number;
  /**
   * Their **Visible** six, in seat order — the export's twelve-bar type spread.
   *
   * Ids, not Forces: the client resolves `primary`/`secondary` from
   * `@lmntlz/content`, so the wire carries no derived data (XV). The Visible
   * squad is the scoutable one by definition, and `GET /players/:id/scout`
   * already serves exactly these six to any signed-in caller — this is the same
   * disclosure one step earlier, not a new one.
   *
   * **The Hidden six are not here and never will be.** No ids, no count, no key.
   */
  readonly visibleHeroIds: readonly string[];
  /** Rating gained by beating them, from the server's own `ratingDeltas`. */
  readonly winDelta: number;
  /** Rating lost by losing to them. Negative. */
  readonly lossDelta: number;
}

export interface CandidateList {
  readonly league: string;
  readonly positionInLeague: number;
  readonly gearScore: number;
  /**
   * **True only when a thin league had to reach a band out**, and it breaks a
   * published promise — the 1.67× gear guarantee does not hold on a widened match.
   * So it is displayed rather than logged.
   */
  readonly widened: boolean;
  readonly candidates: readonly Candidate[];
  /** Percent, 0–90. **Always displayed** — the player is owed the reason. */
  readonly ambushChance: number;
  readonly consecutiveWins: number;
}

export interface StarterStatus {
  readonly active: boolean;
  readonly reason?: string;
  readonly endsAt?: string;
}

export interface Standing {
  readonly league: string;
  readonly gearScore: number;
  readonly positionInLeague: number;
  readonly rating: number;
  readonly ratedBattles: number;
  /** Named, never the K value — the constant moves and the name does not. */
  readonly band: 'provisional' | 'settling' | 'established';
  readonly ambushChance: number;
  readonly consecutiveWins: number;
  readonly starter: StarterStatus;
}

export interface ScoutSeat {
  readonly row: string;
  readonly index: number;
  readonly hero: {
    readonly id: string;
    readonly name: string;
    readonly primary: string;
    readonly secondary: string;
    /** Derived from the two authored types, so it is free information anyway. */
    readonly bane: string;
    readonly fault: string;
    readonly role: string;
    readonly reach: number;
  };
  readonly runes: readonly { readonly element: string; readonly stages: number }[];
}

/**
 * `GET /v1/players/:targetId/scout`.
 *
 * **`hidden` carries a streak and nothing else** — no seats key, no length. The
 * absence of the field *is* the disclosure rule, so this type must not grow one:
 * an optional `seats?` here would invite a client to render "0 champions", which
 * tells a scout the shape of what is missing.
 */
export interface ScoutView {
  readonly playerId: string;
  readonly username: string;
  readonly league: string;
  readonly visible: {
    readonly holdStreak: number;
    readonly canDefend: boolean;
    readonly seats: readonly ScoutSeat[];
  };
  readonly hidden: { readonly holdStreak: number };
}
