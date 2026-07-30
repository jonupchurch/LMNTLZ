/**
 * The shapes `/v1/players/:targetId/profile` and friends return.
 *
 * **Mirrored rather than imported.** `apps/api` is a separate build and the
 * client must never reach into its source — that is how a server-only module
 * ends up in the browser bundle. The compensating control is
 * `apps/api/tests/profiles/boundary.test.ts`, which asserts the real response
 * shape; if these drift, that suite is what says so.
 *
 * **Note what is not here: any squad, either zone.** A type that cannot express
 * a composition is a client that cannot render one by accident.
 */

export interface ProfileBattle {
  readonly battleId: string;
  /** A day, `YYYY-MM-DD`. Never an instant — intervals leak the Hidden count. */
  readonly concludedOn: string;
  readonly role: 'attacker' | 'defender';
  readonly opponent: string | null;
  readonly opponentWasBot: boolean;
  readonly outcome: 'win' | 'loss';
  readonly turnCount: number;
}

export interface AvatarChoice {
  readonly kind: 'curated' | 'custom' | 'default';
  readonly value: string | null;
}

export interface PublicProfileData {
  readonly playerId: string;
  readonly username: string;
  readonly avatar: AvatarChoice;
  readonly accountAgeDays: number;
  readonly league: string | null;
  readonly rating: number | null;
  readonly gearScore: number | null;
  readonly holdStreaks: { readonly visible: number; readonly hidden: number };
  readonly guild: { readonly id: string; readonly name: string; readonly role: string } | null;
  readonly recentBattles: readonly ProfileBattle[];
}

export interface ShardState {
  readonly balance: number;
  readonly lifetimeEarned: number;
  readonly rating: number | null;
  readonly cap: { readonly shards: number; readonly runes: number };
}

export interface AvatarState {
  readonly curated: readonly string[];
  readonly current: AvatarChoice;
  readonly customPrice: { readonly shards: number; readonly cents: number };
  readonly customAvailable: boolean;
}
