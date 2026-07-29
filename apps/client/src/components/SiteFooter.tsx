/**
 * The footer carrying the five policy links.
 *
 * ### Why this exists at all
 *
 * A payment provider will not verify a seller whose site has no visible terms,
 * privacy, refund or contact route, and **a page nothing links to does not
 * count** — the reviewer is a person who starts at the root and follows links.
 * The five pages are static HTML in `public/`; this is how they are found.
 *
 * ### Why plain anchors and not a router
 *
 * These leave the app. A full page load is not a limitation being worked around
 * here, it is the intent: the policies must be reachable when the bundle is
 * broken, which is exactly when somebody goes looking for the refund page. See
 * the header comment in `public/legal.css`.
 */

const LINKS: ReadonlyArray<readonly [href: string, label: string]> = [
  ['/pricing.html', 'Passes'],
  ['/terms.html', 'Terms'],
  ['/privacy.html', 'Privacy'],
  ['/refunds.html', 'Refunds'],
  ['/contact.html', 'Contact'],
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1600px] border-t border-line px-8 py-6">
      <nav aria-label="Policies" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className="text-sm text-faint hover:text-parchment">
            {label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
