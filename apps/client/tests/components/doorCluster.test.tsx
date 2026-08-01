/**
 * The four doors, on every one of the 27 champions.
 *
 * ### What this is actually guarding
 *
 * `DoorCluster` replaced the five-rung ladder on the roster tile, and the thing
 * that could go wrong is not "it fails to render" — it is **rendering the wrong
 * four Forces**, which no screenshot catches because four coloured marks look
 * correct whatever they contain. A cluster showing `primary` where it means
 * `bane` would tell a player to attack with the Force the champion resists, and
 * the grid would look perfectly fine doing it.
 *
 * So the assertions are on the *relationship*: each mark carries the Force the
 * hero derived for that slot, and `bane`/`fault` are re-checked against
 * `counter()` rather than against themselves. Reading `hero.bane` and asserting
 * the mark shows `hero.bane` would pass even if the whole derivation inverted.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { getAllHeroes, counter, type Hero } from '@lmntlz/content';
import { DoorCluster } from '../../src/components/hero/DoorCluster.js';

const HEROES = getAllHeroes();

/** The fill class a mark must carry for a given Force, e.g. `bg-earth`. */
const fillFor = (force: string): string => `bg-${force}`;

const markFor = (container: HTMLElement, door: string): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-door="${door}"]`);
  expect(el, `no mark rendered for the ${door} door`).not.toBeNull();
  return el!;
};

describe('every champion shows four doors', () => {
  it.each(HEROES.map((h): [string, Hero] => [h.name, h]))(
    '%s carries her own strengths and weaknesses',
    (_name, hero) => {
      const { container } = render(<DoorCluster hero={hero} />);

      expect(markFor(container, 'primary').className).toContain(fillFor(hero.primary));
      expect(markFor(container, 'secondary').className).toContain(fillFor(hero.secondary));

      /*
       * **Against `counter()`, not against `hero.bane`.** The hero object is
       * where the derivation already happened; comparing the mark to it only
       * proves the component read a field. Re-deriving here is the assertion
       * that the field means what the rule says it means.
       */
      expect(markFor(container, 'bane').className).toContain(fillFor(counter(hero.primary)));
      expect(markFor(container, 'fault').className).toContain(fillFor(counter(hero.secondary)));
    },
  );
});

describe('the shapes carry the meaning, not the colours alone', () => {
  /**
   * A player who cannot tell the nine colours apart still has to be able to find
   * the Bane — it is the mark worth hitting. Strength and weakness must never
   * share a silhouette, which is the rule `resources/damage-types/README.md`
   * states and the reason `TypeBadge` splits shield from plate.
   */
  it('a strength is a shield and the two weaknesses are not', () => {
    const { container } = render(<DoorCluster hero={HEROES[0]!} />);

    expect(markFor(container, 'primary').className).toContain('lz-shield');
    expect(markFor(container, 'secondary').className).toContain('lz-shield');
    expect(markFor(container, 'bane').className).not.toContain('lz-shield');
    expect(markFor(container, 'fault').className).not.toContain('lz-shield');
  });

  it('the Bane is the ringed circle and the Fault is the plate', () => {
    const { container } = render(<DoorCluster hero={HEROES[0]!} />);

    expect(markFor(container, 'bane').className).toContain('rounded-full');
    expect(markFor(container, 'bane').className).toContain('ring-danger');
    expect(markFor(container, 'fault').className).toContain('lz-plate-sm');
    // The Fault must NOT wear the danger ring — that is what distinguishes the
    // ×1.50 door from the ×1.25 one at 13px.
    expect(markFor(container, 'fault').className).not.toContain('ring-danger');
  });
});

describe('it says out loud what the shapes say visually', () => {
  it('names all four Forces and their roles in one label', () => {
    const hero = HEROES[0]!;
    const { container } = render(<DoorCluster hero={hero} />);
    const label = container.querySelector('[data-door-cluster]')?.getAttribute('aria-label') ?? '';

    // Four bare Force names would be useless — which is a strength and which is
    // a door is the whole content. The roles have to be in the sentence.
    expect(label).toContain(hero.primary);
    expect(label).toContain(hero.secondary);
    expect(label).toMatch(new RegExp(`bane ${hero.bane}`, 'i'));
    expect(label).toMatch(new RegExp(`fault ${hero.fault}`, 'i'));
  });
});
