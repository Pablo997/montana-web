import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Montana',
  description: 'Rules for using Montana.',
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="April 2026">
      <section>
        <h2>What Montana is</h2>
        <p>
          Montana is a community-powered map of mountain incidents, trail
          hazards and points of interest. Content is contributed, voted on
          and moderated by users; we do not verify it.
        </p>
      </section>

      <section>
        <h2>No warranty on safety-critical decisions</h2>
        <p>
          Mountains are dangerous. The information on Montana is crowd-sourced
          and may be incomplete, outdated or wrong. Do <strong>not</strong>{' '}
          rely on it as your sole source when planning routes, evacuations or
          emergency decisions. Always consult official sources (park
          authorities, rescue services, weather bulletins) and use your own
          judgement. You are fully responsible for your safety.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be at least 16 years old, or have guardian consent where applicable.</li>
          <li>You are responsible for keeping your credentials private.</li>
          <li>One person, one account. Multi-accounting to manipulate votes is prohibited and leads to account removal.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable content</h2>
        <p>By posting on Montana you agree that your content:</p>
        <ul>
          <li>Is accurate to the best of your knowledge at the time of posting.</li>
          <li>Does not harass, threaten, or impersonate anyone.</li>
          <li>Does not contain personal data of third parties without consent.</li>
          <li>Does not violate any applicable law, including copyright (use only photos you took or have rights to).</li>
          <li>Does not spam, advertise commercial services, or abuse the system.</li>
        </ul>
        <p>
          We apply automatic moderation (rate limits, community-vote thresholds)
          and may remove content or accounts that violate these rules.
        </p>
      </section>

      <section>
        <h2>License you grant us</h2>
        <p>
          By posting, you grant Montana a non-exclusive, worldwide,
          royalty-free license to host, display, resize, translate and
          distribute your content as necessary to operate the service. You
          keep ownership and can delete your content at any time.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          Montana is provided &quot;as is&quot; and &quot;as available&quot;.
          We may throttle, pause, change or discontinue features without
          prior notice. We are not liable for any damage arising from the
          use or inability to use the service.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms as the product evolves. The{' '}
          <em>Last updated</em> date above reflects the latest revision.
          Continuing to use Montana after a change means you accept the new
          terms.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of Spain, excluding its
          conflict-of-law rules. Disputes are to be resolved in the courts of
          the user&apos;s habitual residence when consumer protection laws so
          require; otherwise, in the courts of the province of Alicante,
          Spain.
        </p>
      </section>
    </LegalPageLayout>
  );
}
