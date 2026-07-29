/**
 * **The two Cyrillic rows are the ones that matter.**
 *
 * A plain lowercase comparison passes every other line in this table and fails
 * exactly those two — and it fails silently, because nothing looks wrong until
 * somebody registers a lookalike of a guild master's name and starts asking
 * people to hand over the emblem.
 */

import { describe, expect, it } from 'vitest';
import {
  USERNAME_MAX,
  USERNAME_MIN,
  displayForm,
  isReserved,
  usernameKey,
  validateUsername,
} from '../../src/auth/username.js';

describe('the uniqueness key', () => {
  it.each([
    ['Reyna', 'the plain form'],
    ['reyna', 'case'],
    ['REYNA', 'case, shouted'],
    ['Ｒeyna', 'fullwidth R — NFKD'],
    ['Réyna', 'a combining acute — stripped'],
    ['rеynа', 'CYRILLIC е and а — the security control'],
  ])('folds %s (%s) onto the same key', (input) => {
    expect(usernameKey(input)).toBe(usernameKey('Reyna'));
  });

  it('keeps genuinely different names apart', () => {
    const distinct = ['Reyna', 'Bramwen', 'Ossic', 'Silka', 'Corvane', 'admin'];
    expect(new Set(distinct.map(usernameKey)).size).toBe(distinct.length);
  });

  it('is deterministic', () => {
    for (let i = 0; i < 50; i++) expect(usernameKey('rеynа')).toBe(usernameKey('rеynа'));
  });

  it('is lossy on purpose and is never shown to anybody', () => {
    // `admin` keys to `adrnin`, because the confusables table maps `m` and `rn`
    // onto each other — `rn` does look like `m` in most typefaces. It reads
    // like a bug and is not: the mapping is CONSISTENT, which is the only
    // property a collision key needs.
    expect(usernameKey('admin')).toBe('adrnin');
    expect(usernameKey('аdmin')).toBe(usernameKey('admin'));
    // And the display form is untouched by any of it.
    expect(displayForm('admin')).toBe('admin');
  });
});

describe('the reserved list', () => {
  it.each(['admin', 'moderator', 'mod', 'system', 'lmntlz', 'support', 'staff', 'envoy', 'official'])(
    'reserves %s',
    (name) => {
      expect(isReserved(usernameKey(name))).toBe(true);
    },
  );

  it('reserves the lookalikes too — or it reserves nothing', () => {
    // The whole trick. Reserving the literal string `admin` while comparing
    // folded keys lets `Admin`, `ADMIN` and the Cyrillic `аdmin` walk straight
    // past the list into the unique index, where they collide with nothing
    // because no account named `admin` exists.
    for (const spoof of ['Admin', 'ADMIN', 'аdmin', 'MODERATOR', 'Ｓystem']) {
      expect(isReserved(usernameKey(spoof)), spoof).toBe(true);
    }
  });

  it('does NOT reserve the hero names or the House names', () => {
    // Flavor, players will want them, and the impersonation risk is nil —
    // nobody is socially engineered by a player called Bramwen.
    for (const name of ['Bramwen', 'Ossic', 'Reyna', 'Silka', 'Cindara', 'Corvane']) {
      expect(isReserved(usernameKey(name)), name).toBe(false);
      expect(validateUsername(name), name).toBeNull();
    }
  });
});

describe('validation', () => {
  it('accepts a plain name', () => {
    expect(validateUsername('Reyna')).toBeNull();
    expect(validateUsername('Reyna_TwoRivers')).toBeNull();
    expect(validateUsername('Player_9')).toBeNull();
  });

  it('enforces the length bounds in CODE POINTS, not UTF-16 units', () => {
    expect(USERNAME_MIN).toBe(3);
    expect(USERNAME_MAX).toBe(16);
    expect(validateUsername('ab')).toBe('too-short');
    expect(validateUsername('a'.repeat(17))).toBe('too-long');
    expect(validateUsername('a'.repeat(16))).toBeNull();

    // An emoji is two UTF-16 units and one character. Counting units would
    // reject a name a player can see is short enough.
    expect(validateUsername('ab😀')).toBe('charset'); // charset rejects it first
  });

  it('rejects spaces and hyphens', () => {
    // > **A spec contradiction, resolved.** T035 asks for `"Reyna Two-Rivers"`
    // > to survive a round trip, while research.md Q3 fixes the character set
    // > as Unicode letters, digits and `_` — which forbids the space and the
    // > hyphen in that very example. The character set is the DECISION; the
    // > name was an illustration borrowed from the roster. The round-trip
    // > property is unaffected and is asserted below with a legal name.
    expect(validateUsername('Reyna Two-Rivers')).toBe('charset');
    expect(validateUsername('Reyna-Two')).toBe('charset');
    expect(validateUsername('Reyna Two')).toBe('charset');
  });

  it('rejects the underscore edge cases', () => {
    expect(validateUsername('_reyna')).toBe('leading-underscore');
    expect(validateUsername('reyna_')).toBe('trailing-underscore');
    expect(validateUsername('rey__na')).toBe('doubled-underscore');
  });

  it('rejects reserved names and their skeletons', () => {
    expect(validateUsername('admin')).toBe('reserved');
    expect(validateUsername('аdmin')).toBe('reserved');
    expect(validateUsername('Support')).toBe('reserved');
  });

  it('accepts non-Latin scripts — this is not an English-only game', () => {
    for (const name of ['レイナ', 'Рейна', 'ريحانة', '雷娜娜']) {
      expect(validateUsername(name), name).toBeNull();
    }
  });

  it('excludes two-character CJK names, which is a real cost of the 3 minimum', () => {
    // > **Flagged, not fixed.** `雷娜` is an entirely ordinary Chinese name and
    // > this rejects it. So does `林` and most Japanese given names written in
    // > kanji. The 3–16 bound is settled in research.md Q3 and reads as a
    // > Latin-alphabet assumption that nobody stated as one.
    // >
    // > Recorded here rather than quietly changed, because the minimum is not
    // > arbitrary either — a 1-character namespace is 26 names in Latin and
    // > tens of thousands in CJK, so lowering it hands a scarce, memorable
    // > namespace to whoever registers fastest, and it cannot be undone once
    // > taken. **A script-aware minimum is the real answer** and it is a design
    // > decision, not an implementation one.
    expect(validateUsername('雷娜')).toBe('too-short');
    expect(validateUsername('林')).toBe('too-short');
  });
});

describe('the display form survives', () => {
  it('is returned exactly as typed, never the folded key', () => {
    // The key is lossy and internal. Rendering it back would show a player a
    // name they did not choose — `Reyna_TwoRivers` becoming `reyna_tworivers`,
    // or worse `adrnin`.
    const typed = 'Reyna_TwoRivers';
    expect(displayForm(typed)).toBe(typed);
    expect(displayForm(typed)).not.toBe(usernameKey(typed));
  });

  it('NFC-normalises and nothing more', () => {
    // Two ways to write é: precomposed, and e + combining acute. NFC makes them
    // one string so the stored bytes do not depend on the player's keyboard —
    // but it does not strip the accent, which is the key's job.
    const precomposed = 'Réyna';
    const decomposed = 'Réyna';
    expect(displayForm(decomposed)).toBe(displayForm(precomposed));
    expect(displayForm(precomposed)).toContain('é');
  });
});
