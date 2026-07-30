/**
 * The fixed public profile (012 T014).
 *
 * **Every field on this component is unconditional.** There is no `if (visible)`
 * anywhere, because there is nothing to hide — the profile is fixed by design,
 * and a conditional here would be the first step towards a per-field toggle the
 * spec explicitly refuses.
 *
 * **Both hold streaks are shown, including the Hidden one.** That is the single
 * number the Hidden zone contributes to this surface, and it is public on
 * purpose: a long-standing defense is what makes a player worth attacking.
 * Nothing else about the Hidden zone appears, in any form.
 */

import type { JSX } from 'react';
import { BattleRecord } from './BattleRecord.js';
import type { PublicProfileData } from './types.js';

const FORCE_GLYPH: Record<string, string> = {
  earth: 'Earth',
  air: 'Air',
  fire: 'Fire',
  water: 'Water',
  light: 'Light',
  dark: 'Dark',
  slash: 'Slash',
  pierce: 'Pierce',
  crush: 'Crush',
  arcane: 'Arcane',
  martial: 'Martial',
};

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs tracking-widest text-faint uppercase">{label}</dt>
      <dd className="mt-1 font-display text-lg text-parchment tabular-nums">{value}</dd>
    </div>
  );
}

export function PublicProfile({ profile }: { profile: PublicProfileData }): JSX.Element {
  const avatarLabel =
    profile.avatar.kind === 'curated' && profile.avatar.value
      ? (FORCE_GLYPH[profile.avatar.value] ?? profile.avatar.value)
      : profile.avatar.kind === 'custom'
        ? 'Custom'
        : '—';

  return (
    <article className="space-y-8">
      <header className="flex items-start gap-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-line bg-raised text-xs tracking-widest text-faint uppercase"
          aria-hidden="true"
        >
          {/* The artwork is part of the visual pass; the slot and its
              precedence are what this feature owes. */}
          {avatarLabel.slice(0, 5)}
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-wide text-parchment">
            {profile.username}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {profile.league ? (
              <span className="capitalize">{profile.league}</span>
            ) : (
              <span className="text-faint">unranked</span>
            )}
            {' · '}
            {profile.accountAgeDays === 0
              ? 'joined today'
              : `${profile.accountAgeDays} days in`}
            {profile.guild ? (
              <>
                {' · '}
                {profile.guild.name}{' '}
                <span className="text-faint capitalize">({profile.guild.role})</span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Rating" value={profile.rating === null ? '—' : String(profile.rating)} />
        <Stat
          label="Gear score"
          value={profile.gearScore === null ? '—' : String(profile.gearScore)}
        />
        <Stat label="Visible hold" value={String(profile.holdStreaks.visible)} />
        <Stat label="Hidden hold" value={String(profile.holdStreaks.hidden)} />
      </dl>

      <BattleRecord battles={profile.recentBattles} username={profile.username} />
    </article>
  );
}
