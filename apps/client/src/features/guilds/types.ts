/**
 * The shapes `/v1/guilds` and `/v1/me/guild` return.
 *
 * Written against the API's own return types rather than guessed: every field here
 * exists because a handler in `apps/api/src/guilds/routes.ts` puts it there.
 */

export interface Emblem {
  readonly icon: number;
  readonly ink: number;
  readonly ground: number;
}

export interface GuildMemberView {
  readonly playerId: string;
  readonly username: string | null;
  readonly role: 'master' | 'officer' | 'member';
  readonly joinedAt: string;
}

export interface GuildView {
  readonly id: string;
  readonly name: string;
  readonly emblem: Emblem;
  readonly pitch: string;
  readonly motd: string | null;
  readonly motdSetAt: string | null;
  readonly foundedAt: string;
  readonly disbanded: boolean;
  readonly memberCount: number;
  readonly capacity: number;
  readonly members: readonly GuildMemberView[];
}

export interface ApplicationView {
  readonly id: string;
  readonly guildId: string;
  readonly accountId: string;
  readonly state: string;
  readonly message: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface InviteView {
  readonly id: string;
  readonly guildId: string;
  readonly guildName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * The three fields of 009's warning, **all literally `true`**.
 *
 * `null` means the player has nothing left to lose. The client renders on the
 * *presence* of this object, never on a boolean it computed itself — a screen that
 * decided for itself whether to warn is the screen that has dropped the warning
 * three times.
 */
export interface StarterWarning {
  readonly endsBotOpponents: true;
  readonly endsIncomeMultiplier: true;
  readonly permanent: true;
}

export interface SuccessionView {
  readonly id: string;
  readonly guildId: string;
  readonly requestedBy: string;
  readonly formerMasterId: string;
  readonly requestedAt: string;
  readonly completesAt: string;
  readonly state: string;
}

export interface MyGuildState {
  readonly guild: GuildView | null;
  readonly role: 'master' | 'officer' | 'member' | null;
  readonly succession: SuccessionView | null;
  readonly applications: readonly ApplicationView[];
  readonly invites: readonly InviteView[];
  readonly applicationBudget: { readonly used: number; readonly max: number };
}

export interface FoundingInfo {
  readonly cost: number;
  readonly capacity: number;
  readonly palette: { readonly icons: number; readonly inks: number; readonly grounds: number };
  readonly starterWarning: StarterWarning | null;
}

/** The two wire strings, **both required**. They are two different losses. */
export const ACKNOWLEDGEMENTS = ['bot-opponents-end', 'income-multiplier-ends'] as const;
