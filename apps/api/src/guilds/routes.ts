/**
 * `/v1/guilds`, `/v1/applications`, `/v1/invites` (013 T001, T028, T038).
 *
 * ### Permissions are enforced here, never by hiding a control
 *
 * Constitution XII. A client that wrongly renders the disband button must still
 * get a `403` when it presses it — `roles.test.ts` asserts the refusal rather than
 * the button's absence, because the button is not the thing that protects a guild.
 *
 * ### The two starter-league doors that live here
 *
 * Applying and accepting an invitation both require **both** acknowledgements from
 * a player still in the starter league. Founding is the third and is enforced in
 * `found.ts`, where the transaction is. All three go through 009's
 * `guildDoorConfirm()`, which is the only constructor of a confirm.
 *
 * ### `GET /v1/guilds/:guildId` never contains
 *
 * another player's applications, any member's shard balance, or any squad
 * composition. **Storing is not exposing** (Constitution XVII) — the roster is
 * public because guild membership is; the review queue is not, because an
 * application is between one player and one guild.
 */

import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { requireSession } from '../auth/middleware.js';
import { requireContext, type AuthedEnv } from '../auth/context.js';
import { apiError } from '../errors.js';
import { db } from '../db/client.js';
import { accounts } from '../db/schema/accounts.js';
import { guilds } from '../db/schema/guilds.js';
import { guildDoorConfirm } from '../matchmaking/starterLeague.js';
import { systemClock } from './clock.js';
import {
  EMBLEM_GROUNDS,
  EMBLEM_ICONS,
  EMBLEM_INKS,
  FOUNDING_COST_SHARDS,
  GUILD_CAPACITY,
  MAX_CONCURRENT_APPLICATIONS,
} from './config.js';
import { foundGuild, setEmblem, setPitch, type Emblem } from './found.js';
import {
  acceptApplication,
  applicationsOf,
  apply,
  dismissApplication,
  expireOverdue,
  openApplicationCount,
  pendingFor,
  withdrawApplication,
} from './applications.js';
import {
  acceptInvite,
  declineInvite,
  expireOverdueInvites,
  invite,
  invitesFor,
} from './invites.js';
import { authorise, disband, kick, leaveGuild, membershipOf, roster, setRole } from './membership.js';

export const guildRoutes = new Hono<AuthedEnv>();

/** Every route here is a signed-in action. There is no anonymous guild browsing. */
guildRoutes.use('/guilds', requireSession);
guildRoutes.use('/guilds/*', requireSession);
guildRoutes.use('/applications/*', requireSession);
guildRoutes.use('/invites', requireSession);
guildRoutes.use('/invites/*', requireSession);
guildRoutes.use('/me/guild', requireSession);

const ACKNOWLEDGEMENTS = ['bot-opponents-end', 'income-multiplier-ends'] as const;

interface Body {
  readonly [key: string]: unknown;
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Body> {
  const parsed = (await c.req.json().catch(() => null)) as Body | null;
  return parsed ?? {};
}

/**
 * Both acknowledgements, or a `409` that says which are missing.
 *
 * Shared by the two doors here so they cannot drift. Founding's copy lives in
 * `found.ts` because it has to be inside the transaction's guard, and both call
 * `guildDoorConfirm` — which is what makes the *warning* impossible to omit.
 */
async function starterDoorBlocked(
  accountId: string,
  door: 'application' | 'invitation',
  guildId: string,
  acknowledged: unknown,
): Promise<{ readonly warning: unknown } | null> {
  const confirm = await guildDoorConfirm(accountId, door, guildId);
  if (confirm.starterWarning === null) return null;

  const given = new Set(Array.isArray(acknowledged) ? acknowledged.map(String) : []);
  if (ACKNOWLEDGEMENTS.every((a) => given.has(a))) return null;

  return { warning: confirm.starterWarning };
}

/** What the client needs to render the founding screen before anything is typed. */
guildRoutes.get('/guilds/new', async (c) => {
  const { accountId } = requireContext(c);

  return c.json(
    {
      cost: FOUNDING_COST_SHARDS,
      capacity: GUILD_CAPACITY,
      palette: { icons: EMBLEM_ICONS, inks: EMBLEM_INKS, grounds: EMBLEM_GROUNDS },
      /** `null` when they have nothing left to lose. The client renders on this. */
      starterWarning: (await guildDoorConfirm(accountId, 'founding', null)).starterWarning,
    },
    200,
  );
});

guildRoutes.post('/guilds', async (c) => {
  const { accountId } = requireContext(c);
  const input = await body(c);

  if (typeof input['name'] !== 'string') {
    return c.json(apiError('malformed_request', 'A `name` is required.'), 400);
  }

  const result = await foundGuild(
    accountId,
    {
      name: input['name'],
      ...(typeof input['pitch'] === 'string' ? { pitch: input['pitch'] } : {}),
      ...(isEmblem(input['emblem']) ? { emblem: input['emblem'] } : {}),
      ...(Array.isArray(input['acknowledged'])
        ? { acknowledged: input['acknowledged'].map(String) }
        : {}),
    },
    systemClock,
  );

  if (result.ok) return c.json({ guildId: result.guildId, charged: result.charged }, 201);

  switch (result.reason) {
    case 'insufficient-shards':
      return c.json(
        {
          ...apiError('insufficient_shards', `Founding a guild costs ${FOUNDING_COST_SHARDS} shards.`),
          required: result.required,
          available: result.available,
        },
        402,
      );
    case 'starter-warning-not-acknowledged':
      return c.json(
        {
          ...apiError(
            'starter_warning_required',
            'Founding a guild ends beginner status and the ×1.5 income bonus. ' +
              'Both must be acknowledged.',
          ),
          acknowledgements: ACKNOWLEDGEMENTS,
        },
        409,
      );
    case 'name-taken':
      return c.json(apiError('name_taken', 'That guild name is taken.'), 409);
    case 'already-in-a-guild':
      return c.json(apiError('already_in_a_guild', 'You are already in a guild.'), 409);
    default:
      return c.json(apiError('invalid_guild', result.reason), 422);
  }
});

function isEmblem(value: unknown): value is Emblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Emblem).icon === 'number' &&
    typeof (value as Emblem).ink === 'number' &&
    typeof (value as Emblem).ground === 'number'
  );
}

/** The caller's own guild, or `null`. The client's first call on the Guild tab. */
guildRoutes.get('/me/guild', async (c) => {
  const { accountId } = requireContext(c);

  const membership = await membershipOf(accountId);

  /** The budget, **shown rather than discovered** (FR-008). */
  await expireOverdue(systemClock);
  await expireOverdueInvites(systemClock);

  return c.json(
    {
      guild: membership ? await guildView(membership.guildId) : null,
      role: membership?.role ?? null,
      applications: membership ? [] : await applicationsOf(accountId),
      invites: membership ? [] : await invitesFor(accountId),
      applicationBudget: {
        used: await openApplicationCount(accountId),
        max: MAX_CONCURRENT_APPLICATIONS,
      },
    },
    200,
  );
});

/**
 * A guild, with its roster.
 *
 * `boundary.test.ts` asserts what this **never** contains: another player's
 * applications, any shard balance, any squad composition.
 */
async function guildView(guildId: string): Promise<unknown> {
  const [guild] = await db()
    .select({
      id: guilds.id,
      name: guilds.name,
      emblemIcon: guilds.emblemIcon,
      emblemInk: guilds.emblemInk,
      emblemGround: guilds.emblemGround,
      pitch: guilds.pitch,
      motd: guilds.motd,
      motdSetAt: guilds.motdSetAt,
      foundedAt: guilds.foundedAt,
      disbandedAt: guilds.disbandedAt,
    })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  if (!guild) return null;

  const members = await roster(guildId);
  const ids = members.map((m) => m.accountId);
  const names =
    ids.length === 0
      ? []
      : await db()
          .select({ id: accounts.id, username: accounts.username })
          .from(accounts)
          .where(inArray(accounts.id, ids));

  const nameOf = new Map(names.map((n) => [n.id, n.username]));

  return {
    id: guild.id,
    name: guild.name,
    emblem: { icon: guild.emblemIcon, ink: guild.emblemInk, ground: guild.emblemGround },
    pitch: guild.pitch,
    motd: guild.motd,
    motdSetAt: guild.motdSetAt,
    foundedAt: guild.foundedAt,
    disbanded: guild.disbandedAt !== null,
    memberCount: members.length,
    capacity: GUILD_CAPACITY,
    members: members.map((m) => ({
      playerId: m.accountId,
      username: nameOf.get(m.accountId) ?? null,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}

guildRoutes.get('/guilds/:guildId', async (c) => {
  const view = await guildView(c.req.param('guildId'));
  if (!view) return c.json(apiError('not_found', 'No such guild.'), 404);

  return c.json(view, 200);
});

guildRoutes.post('/guilds/:guildId/applications', async (c) => {
  const { accountId } = requireContext(c);
  const guildId = c.req.param('guildId');
  const input = await body(c);

  const blocked = await starterDoorBlocked(
    accountId,
    'application',
    guildId,
    input['acknowledged'],
  );

  if (blocked) {
    return c.json(
      {
        ...apiError(
          'starter_warning_required',
          'Joining a guild ends beginner status and the ×1.5 income bonus. ' +
            'Both must be acknowledged.',
        ),
        acknowledgements: ACKNOWLEDGEMENTS,
        starterWarning: blocked.warning,
      },
      409,
    );
  }

  const result = await apply(
    accountId,
    guildId,
    typeof input['message'] === 'string' ? input['message'] : '',
    systemClock,
  );

  if (result.ok) {
    return c.json({ applicationId: result.applicationId, expiresAt: result.expiresAt }, 201);
  }

  switch (result.reason) {
    case 'no-such-guild':
      return c.json(apiError('not_found', 'No such guild.'), 404);
    case 'budget-exhausted':
      return c.json(
        {
          ...apiError(
            'application_budget',
            `You can have ${MAX_CONCURRENT_APPLICATIONS} applications open at once.`,
          ),
          open: result.open,
          max: MAX_CONCURRENT_APPLICATIONS,
        },
        409,
      );
    case 'cooldown':
      return c.json(
        { ...apiError('cooldown', 'That guild dismissed a recent application.'), retryAt: result.retryAt },
        409,
      );
    default:
      return c.json(apiError(result.reason.replace(/-/g, '_'), result.reason), 409);
  }
});

/** An officer's review queue. **Not on the public guild view.** */
guildRoutes.get('/guilds/:guildId/applications', async (c) => {
  const { accountId } = requireContext(c);
  const guildId = c.req.param('guildId');

  const { allowed } = await authorise(guildId, accountId, 'accept');
  if (!allowed) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  await expireOverdue(systemClock);
  return c.json({ applications: await pendingFor(guildId) }, 200);
});

guildRoutes.post('/applications/:applicationId/accept', async (c) => {
  const { accountId } = requireContext(c);
  const applicationId = c.req.param('applicationId');

  const membership = await membershipOf(accountId);
  if (!membership) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  const { allowed } = await authorise(membership.guildId, accountId, 'accept');
  if (!allowed) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  const result = await acceptApplication(applicationId, systemClock);
  if (result.ok) return c.json({ accepted: true, playerId: result.accountId }, 200);

  switch (result.reason) {
    case 'already-joined':
      /** The officer sees a sentence, not a server error. */
      return c.json(
        { ...apiError('already_joined', 'They joined another guild a moment ago.'), guildId: result.guildId },
        409,
      );
    case 'expired':
      return c.json(apiError('gone', 'That application has expired.'), 410);
    case 'no-such-application':
      return c.json(apiError('not_found', 'No such application.'), 404);
    case 'guild-full':
      return c.json(apiError('guild_full', `A guild holds ${GUILD_CAPACITY}.`), 409);
    default:
      return c.json(apiError('not_open', 'That application is no longer open.'), 409);
  }
});

guildRoutes.post('/applications/:applicationId/dismiss', async (c) => {
  const { accountId } = requireContext(c);

  const membership = await membershipOf(accountId);
  if (!membership) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  const { allowed } = await authorise(membership.guildId, accountId, 'accept');
  if (!allowed) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  const result = await dismissApplication(c.req.param('applicationId'), systemClock);
  return result.ok
    ? c.json({ dismissed: true }, 200)
    : c.json(apiError('not_open', 'That application is no longer open.'), 409);
});

guildRoutes.post('/applications/:applicationId/withdraw', async (c) => {
  const { accountId } = requireContext(c);

  const result = await withdrawApplication(c.req.param('applicationId'), accountId, systemClock);
  return result.ok
    ? c.json({ withdrawn: true }, 200)
    : c.json(apiError('not_open', 'That application is no longer open.'), 409);
});

guildRoutes.post('/guilds/:guildId/invites', async (c) => {
  const { accountId } = requireContext(c);
  const guildId = c.req.param('guildId');
  const input = await body(c);

  const { allowed } = await authorise(guildId, accountId, 'invite');
  if (!allowed) return c.json(apiError('forbidden', 'Officers and above only.'), 403);

  if (typeof input['playerId'] !== 'string') {
    return c.json(apiError('malformed_request', 'A `playerId` is required.'), 400);
  }

  const result = await invite(guildId, input['playerId'], accountId, systemClock);
  if (result.ok) return c.json({ inviteId: result.inviteId, expiresAt: result.expiresAt }, 201);

  return c.json(apiError(result.reason.replace(/-/g, '_'), result.reason), 409);
});

guildRoutes.get('/invites', async (c) => {
  const { accountId } = requireContext(c);

  await expireOverdueInvites(systemClock);
  return c.json({ invites: await invitesFor(accountId) }, 200);
});

guildRoutes.post('/invites/:inviteId/accept', async (c) => {
  const { accountId } = requireContext(c);
  const inviteId = c.req.param('inviteId');
  const input = await body(c);

  const invites = await invitesFor(accountId);
  const target = invites.find((i) => i.id === inviteId);
  if (!target) return c.json(apiError('not_found', 'No such invitation.'), 404);

  const blocked = await starterDoorBlocked(
    accountId,
    'invitation',
    target.guildId,
    input['acknowledged'],
  );

  if (blocked) {
    return c.json(
      {
        ...apiError(
          'starter_warning_required',
          'Joining a guild ends beginner status and the ×1.5 income bonus. ' +
            'Both must be acknowledged.',
        ),
        acknowledgements: ACKNOWLEDGEMENTS,
        starterWarning: blocked.warning,
      },
      409,
    );
  }

  const result = await acceptInvite(inviteId, accountId, systemClock);
  if (result.ok) return c.json({ guildId: result.guildId }, 200);

  switch (result.reason) {
    case 'already-joined':
      return c.json(
        { ...apiError('already_joined', 'You are already in a guild.'), guildId: result.guildId },
        409,
      );
    case 'expired':
      return c.json(apiError('gone', 'That invitation has expired.'), 410);
    case 'no-such-invite':
      return c.json(apiError('not_found', 'No such invitation.'), 404);
    default:
      return c.json(apiError(result.reason.replace(/-/g, '_'), result.reason), 409);
  }
});

guildRoutes.post('/invites/:inviteId/decline', async (c) => {
  const { accountId } = requireContext(c);

  const result = await declineInvite(c.req.param('inviteId'), accountId, systemClock);
  return result.ok
    ? c.json({ declined: true }, 200)
    : c.json(apiError('not_open', 'That invitation is no longer open.'), 409);
});

guildRoutes.put('/guilds/:guildId/emblem', async (c) => {
  const { accountId } = requireContext(c);
  const guildId = c.req.param('guildId');
  const input = await body(c);

  const { allowed } = await authorise(guildId, accountId, 'emblem');
  if (!allowed) return c.json(apiError('forbidden', 'The guild master only.'), 403);

  if (!isEmblem(input['emblem'])) {
    return c.json(apiError('malformed_request', 'An `emblem` is required.'), 400);
  }

  const result = await setEmblem(guildId, input['emblem']);
  return result.ok
    ? c.json({ emblem: input['emblem'] }, 200)
    : c.json(apiError('emblem_invalid', 'That emblem is not in the palette.'), 422);
});

guildRoutes.put('/guilds/:guildId/pitch', async (c) => {
  const { accountId } = requireContext(c);
  const guildId = c.req.param('guildId');
  const input = await body(c);

  const { allowed } = await authorise(guildId, accountId, 'pitch');
  if (!allowed) return c.json(apiError('forbidden', 'The guild master only.'), 403);

  const result = await setPitch(guildId, typeof input['pitch'] === 'string' ? input['pitch'] : '');
  return result.ok
    ? c.json({ pitch: input['pitch'] }, 200)
    : c.json(apiError('pitch_too_long', 'That pitch is too long.'), 422);
});

guildRoutes.put('/guilds/:guildId/members/:targetId/role', async (c) => {
  const { accountId } = requireContext(c);
  const input = await body(c);
  const role = input['role'];

  if (role !== 'officer' && role !== 'member') {
    return c.json(apiError('malformed_request', 'A `role` of officer or member is required.'), 400);
  }

  const result = await setRole(
    c.req.param('guildId'),
    accountId,
    c.req.param('targetId'),
    role,
  );

  if (result.ok) return c.json({ role: result.role }, 200);

  return result.reason === 'forbidden'
    ? c.json(apiError('forbidden', 'The guild master only.'), 403)
    : c.json(apiError(result.reason.replace(/-/g, '_'), result.reason), 409);
});

guildRoutes.delete('/guilds/:guildId/members/:targetId', async (c) => {
  const { accountId } = requireContext(c);

  const result = await kick(c.req.param('guildId'), accountId, c.req.param('targetId'));
  if (result.ok) return c.json({ removed: true }, 200);

  return result.reason === 'not-a-member'
    ? c.json(apiError('not_found', 'They are not in this guild.'), 404)
    : c.json(apiError('forbidden', 'You cannot remove them.'), 403);
});

guildRoutes.post('/guilds/:guildId/leave', async (c) => {
  const { accountId } = requireContext(c);

  const result = await leaveGuild(accountId, systemClock);
  if (result.ok) return c.json({ left: true, dissolved: result.dissolved }, 200);

  return result.reason === 'not-a-member'
    ? c.json(apiError('not_found', 'You are not in a guild.'), 404)
    : c.json(
        apiError(
          'master_must_hand_over',
          'Promote somebody and hand over, or disband — a guild with no master is frozen.',
        ),
        409,
      );
});

guildRoutes.delete('/guilds/:guildId', async (c) => {
  const { accountId } = requireContext(c);

  const result = await disband(c.req.param('guildId'), accountId, systemClock);
  return result.ok
    ? c.json({ disbanded: true }, 200)
    : c.json(apiError('forbidden', 'The guild master only.'), 403);
});
