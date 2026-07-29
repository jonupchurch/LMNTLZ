import { DAMAGE_TYPES, contentVersion, getAllHeroes } from '@lmntlz/content';

/**
 * The bootstrap shell.
 *
 * Feature 006's squad builder replaces this. It exists now to prove the seam
 * that matters: **the client reads the roster from `@lmntlz/content`**, the same
 * validated module the server reads, rather than from a copy. If this renders 27
 * heroes and a content stamp, the workspace wiring is correct.
 */
export function App() {
  const roster = getAllHeroes();

  return (
    <main className="mx-auto max-w-[1600px] px-8 py-12">
      <h1 className="font-display text-5xl font-bold tracking-[0.18em] text-parchment">LMNTLZ</h1>
      <p className="mt-2 font-display text-sm tracking-widest text-faint">
        Send six to strike. Leave six to stand.
      </p>

      <p className="mt-8 text-muted">
        {roster.length} champions · {DAMAGE_TYPES.length} forces · content{' '}
        <code className="font-mono text-gold">{contentVersion()}</code>
      </p>

      <ul className="mt-6 flex flex-wrap gap-2">
        {DAMAGE_TYPES.map((type) => (
          <li
            key={type}
            className="rounded border border-line bg-raised px-3 py-1 font-display text-xs tracking-widest uppercase"
          >
            {type}
          </li>
        ))}
      </ul>
    </main>
  );
}
