import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Montana',
  description: 'Rules for using Montana.',
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="April 2026 (moderation & EXIF added)">
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
          We apply automatic moderation (rate limits, community-vote thresholds,
          report-count auto-hide) and may remove content or accounts that
          violate these rules.
        </p>
      </section>

      <section>
        <h2>Reporting abuse</h2>
        <p>
          Any signed-in user can report an incident that violates these rules
          using the <em>Report this incident</em> link on the incident panel.
          Reports are capped at 10 per user per 24 hours to deter brigading.
          When an incident accumulates several independent reports it is
          automatically hidden from the map pending human review; if our
          review confirms the violation the content is permanently removed
          and, depending on severity, the author&apos;s account may be
          restricted or terminated.
        </p>
        <p>
          You cannot report your own incidents — use the delete button on
          your own posts instead. Reports are confidential: the reported
          author never sees who submitted the report.
        </p>
      </section>

      <section>
        <h2>Photo uploads and privacy</h2>
        <p>
          When you attach photos to an incident, your browser automatically
          re-encodes them before upload, which strips all EXIF metadata
          (GPS coordinates, camera model, timestamps). This protects you
          from accidentally disclosing the location of your home or other
          private places. Only the map pin you placed yourself is shared.
        </p>
        <p>
          By uploading a photo you confirm it does not depict identifiable
          people without their consent and does not include copyrighted
          material you do not own.
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
