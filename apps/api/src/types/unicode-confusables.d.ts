/**
 * `unicode-confusables` ships no type declarations, so they are declared here.
 *
 * ### Why a third-party package for a security control
 *
 * `usernameKey`'s third step is a Unicode TR39 confusable skeleton, and TR39 is
 * a ~6,000-line data table maintained by the Unicode Consortium. Hand-rolling a
 * subset would cover the homoglyphs somebody thought of and miss the rest —
 * which is the worst outcome, because it *looks* like the control is in place.
 *
 * ### What makes it acceptable
 *
 * The package is a pure data transformation: no network, no filesystem, no
 * child process. It is pinned, and — more to the point — **our own tests assert
 * the behaviour we depend on** rather than trusting the package to keep it. If
 * an update stopped folding Cyrillic `е` onto Latin `e`, `usernameKey.test.ts`
 * fails. The dependency supplies the table; the test owns the requirement.
 */
declare module 'unicode-confusables' {
  /**
   * Replace confusable characters with their canonical counterparts.
   *
   * **Lossy and bidirectional.** It maps `m` and `rn` onto each other, so
   * `admin` becomes `adrnin` — which looks like a bug and is not: the mapping is
   * *consistent*, which is the only property a collision key needs, and the key
   * is never shown to anybody.
   */
  export function rectifyConfusion(input: string): string;

  /** True when the string contains characters confusable with others. */
  export function isConfusing(input: string): boolean;

  export function confusables(input: string): unknown;
}
