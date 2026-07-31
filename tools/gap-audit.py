"""Diff every API route against every path the client can actually request.

READ-ONLY. Reads source; writes nothing.

Answers one question: **which routes are built, deployed, and unreachable?** That
is this project's most repeated defect — a route nothing calls does not error, does
not log and does not fail a test. It produces silence.

Run:  py tools/gap-audit.py

Expected output, verified 2026-07-30 and recorded in specs/GAPS.md:
  API routes defined  : 57
  Client (verb, path) : 37
  23 routes with no client caller -- 7 intentional, 16 gaps

MUTATION-TESTED 2026-07-30, because a scan that cannot fail has never been able to
fail. Replacing the two `/me/shards` call sites with a dummy path took the count
16 -> 17 and surfaced `GET /me/shards` by name; restoring both files from copies
returned it to 16 with the sources byte-identical (md5 verified, `git status`
clean). The scan detects a real regression rather than merely producing a number.

TWO THINGS THIS SCRIPT GETS RIGHT THAT AN EYEBALL DOES NOT:

  1. IT IS VERB-AWARE. The first pass keyed on path alone and reported 14 gaps.
     `GET /guilds/:id/applications` looked called because the client POSTs to the
     same path to APPLY. Verb-blindness hid the fact that an officer cannot read
     the applications they receive. Matching on (verb, path) found two more.

  2. IT NORMALISES PARAMS AND THE /v1 PREFIX. The API declares `:guildId`, the
     client interpolates `${guild.id}`, and some client paths carry `/v1` while
     others rely on the base URL. All three collapse to one shape here.

KNOWN LIMIT, stated rather than hidden: a client path assembled from a variable
(`api(path)` where `path` was built elsewhere) is only seen if the literal appears
somewhere in client source. It does today -- GuildRoster.tsx builds five paths as
template literals and passes them to a helper, and all five are found. A path
assembled from concatenated fragments would be missed.
"""
import glob
import io
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def is_test(path):
    slug = path.replace('\\', '/')
    return '.test.' in slug or '/tests/' in slug


def normalise(path):
    """`:guildId`, `${guild.id}` and a leading `/v1` all collapse to one shape."""
    path = re.sub(r'\$\{[^}]+\}', ':p', path)
    path = re.sub(r':[A-Za-z0-9_]+', ':p', path)
    return path[3:] if path.startswith('/v1/') else path


def routes_defined():
    found = set()
    for path in glob.glob('apps/api/src/**/*.ts', recursive=True):
        if is_test(path):
            continue
        src = open(path, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r"\.(get|post|put|patch|delete)\(\s*'(/[^']*)'", src):
            found.add((m.group(1).upper(), normalise(m.group(2))))
    return found


def paths_called():
    """A call is a path literal plus the method in the init object after it.

    No method named means GET, which is `fetch`'s default and the convention
    `lib/api.ts` inherits.
    """
    found = set()
    for path in glob.glob('apps/client/src/**/*.ts*', recursive=True):
        src = open(path, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r"[`'\"](/[A-Za-z0-9][A-Za-z0-9/:._${}-]*)[`'\"]", src):
            route = normalise(m.group(1))
            if route.endswith('.html'):
                continue
            window = src[m.end():m.end() + 220]
            verb = re.search(r"method:\s*'(GET|POST|PUT|PATCH|DELETE)'", window)
            found.add((verb.group(1) if verb else 'GET', route))
    return found


# Not a suppression list — each entry states who the real caller is. A route
# here is reachable; a route missing from here and from the client is not.
INTENTIONAL = {
    ('GET', '/health'): 'monitoring probe',
    ('POST', '/webhooks/payments'): 'the payment provider calls this',
    ('POST', '/jobs/guild-applications/expire'): 'CRON TARGET — nothing schedules it yet',
    ('POST', '/jobs/guild-successions/complete'): 'CRON TARGET — nothing schedules it yet',
    ('POST', '/auth/link'): 'Steam seam, built unused by design',
    ('DELETE', '/auth/link/:p'): 'Steam seam, built unused by design',
    ('POST', '/auth/steam'): 'Steam seam, built unused by design',
}

OWNER = {
    '/catalog': '011 payments', '/checkout': '011 payments',
    '/me/entitlements': '011 payments', '/heroes/:p/runes/:p': '010 progression',
    '/replays/:p': '008 replays', '/me/battles': '008 replays (redundant)',
    '/me': '005 auth (redundant)', '/invites': '013 guilds (redundant)',
    '/guilds/:p': '013 guilds', '/guilds/:p/applications': '013 guilds',
    '/applications/:p/accept': '013 guilds', '/applications/:p/dismiss': '013 guilds',
    '/guilds/:p/invites': '013 guilds', '/guilds/:p/pitch': '013 guilds',
    '/matchmaking/config': '009 matchmaking', '/me/starter/exit': '009 matchmaking',
}


def main():
    defined, called = routes_defined(), paths_called()
    print('API routes defined  :', len(defined))
    print('Client (verb, path) :', len(called))
    print()

    orphans = [(v, p) for v, p in sorted(defined) if (v, p) not in called]
    print('=== %d ROUTES WITH NO CLIENT CALLER ===' % len(orphans))
    print()
    print('-- intentional: something other than the client calls these --')
    for verb, path in orphans:
        if (verb, path) in INTENTIONAL:
            print('   %-6s %-38s %s' % (verb, path, INTENTIONAL[(verb, path)]))
    print()
    print('-- GAPS: built, deployed, and no player can reach it --')
    gaps = [(v, p) for v, p in orphans if (v, p) not in INTENTIONAL]
    for verb, path in gaps:
        print('   %-6s %-38s %s' % (verb, path, OWNER.get(path, '?')))
    print()
    print('%d gaps. See specs/GAPS.md.' % len(gaps))


if __name__ == '__main__':
    main()
