import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Cookie Policy — Montana',
  description: 'Montana uses only strictly necessary cookies.',
};

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="April 2026">
      <section>
        <h2>TL;DR</h2>
        <p>
          Montana uses <strong>only strictly necessary cookies</strong>:
          ones required to authenticate you and keep you signed in. We
          don&apos;t use advertising, marketing, profiling, or third-party
          tracking cookies. That&apos;s why there is no &quot;Accept
          cookies&quot; popup — under Spanish LSSI art. 22.2 and the EU
          ePrivacy Directive, consent is not required for strictly
          necessary cookies.
        </p>
      </section>

      <section>
        <h2>1. What is a cookie?</h2>
        <p>
          A cookie is a small text file stored by your browser. It lets a
          site remember state between requests. Similar technologies
          (localStorage, sessionStorage, IndexedDB) are covered by the
          same rules and are treated identically in this policy.
        </p>
      </section>

      <section>
        <h2>2. Cookies we use</h2>
        <table className="legal__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Purpose</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Provider</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sb-access-token</code></td>
              <td>Keeps you signed in (JWT access token)</td>
              <td>Strictly necessary</td>
              <td>Session / 1 hour</td>
              <td>Supabase (first-party)</td>
            </tr>
            <tr>
              <td><code>sb-refresh-token</code></td>
              <td>Refreshes your session when the access token expires</td>
              <td>Strictly necessary</td>
              <td>Up to 30 days</td>
              <td>Supabase (first-party)</td>
            </tr>
            <tr>
              <td><code>montana.consent</code></td>
              <td>Remembers that you&apos;ve seen the legal notice so we don&apos;t show it again</td>
              <td>Strictly necessary</td>
              <td>12 months (localStorage)</td>
              <td>First-party</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. Analytics</h2>
        <p>
          We use <strong>Vercel Web Analytics</strong> and{' '}
          <strong>Vercel Speed Insights</strong>. Both are{' '}
          <em>cookieless</em>: they measure aggregate page views and
          performance without writing cookies, without fingerprinting and
          without persisting personal identifiers. Under the AEPD
          guidance of July 2023, cookieless aggregate measurement of this
          kind does not require prior consent.
        </p>
      </section>

      <section>
        <h2>4. Third parties</h2>
        <p>
          Map tiles are served by <strong>MapTiler</strong>. Their
          servers see your IP and the tiles you request, but this traffic
          does not set any cookies in your browser. Supabase storage
          serves user-uploaded photos the same way.
        </p>
      </section>

      <section>
        <h2>5. How to control cookies</h2>
        <p>
          Since we only use strictly necessary cookies, blocking them in
          your browser will sign you out and prevent you from using the
          app. You can still clear them at any time from your browser
          settings.
        </p>
        <p>
          If we ever add non-essential cookies in the future, we will
          show a proper consent banner before setting them and give you
          granular controls.
        </p>
      </section>

      <section>
        <h2>6. Changes</h2>
        <p>
          The &quot;Last updated&quot; date above reflects the latest
          revision. We will notify material changes in-app.
        </p>
      </section>
    </LegalPageLayout>
  );
}
