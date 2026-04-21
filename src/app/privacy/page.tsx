import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Montana',
  description: 'How Montana collects, uses and protects your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="April 2026">
      <section>
        <h2>TL;DR</h2>
        <p>
          Montana stores the minimum data needed to run a community map of
          mountain incidents: your email, the incidents you post and the
          photos attached to them. We don&apos;t sell anything to anyone. We
          don&apos;t use tracking cookies or advertising.
        </p>
      </section>

      <section>
        <h2>1. Data controller</h2>
        <p>
          The entity responsible for the processing of your personal data
          under Regulation (EU) 2016/679 (&quot;GDPR&quot;) and the Spanish
          LOPDGDD is the Montana project operator. You can reach the data
          controller at the contact email published in the repository
          README.
        </p>
      </section>

      <section>
        <h2>2. What we collect and legal basis</h2>
        <table className="legal__table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Purpose</th>
              <th>Legal basis (GDPR art. 6)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email address (+ hashed password or OAuth identifier)</td>
              <td>Authentication, account recovery</td>
              <td>Contract — art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Incidents you create (type, severity, title, description, coordinates, elevation, photos)</td>
              <td>Rendering the shared map, operating the service</td>
              <td>Contract — art. 6(1)(b)</td>
            </tr>
            <tr>
              <td>Votes on incidents</td>
              <td>Community ranking and moderation</td>
              <td>Legitimate interest — art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Server logs (IP, user agent, timestamp)</td>
              <td>Security, abuse prevention, debugging</td>
              <td>Legitimate interest — art. 6(1)(f)</td>
            </tr>
            <tr>
              <td>Aggregate anonymous analytics</td>
              <td>Understanding traffic patterns</td>
              <td>Legitimate interest — art. 6(1)(f)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. What we do NOT collect</h2>
        <ul>
          <li>Real-time location tracking. Geolocation is only read in your browser when you explicitly trigger it.</li>
          <li>Contacts, calendar, microphone, or any other device-level permission.</li>
          <li>Cross-site tracking. We use no third-party advertising cookies or fingerprinting.</li>
          <li>Special categories of data under art. 9 GDPR (health, religion, ethnicity, etc.).</li>
        </ul>
      </section>

      <section>
        <h2>4. Who processes your data (sub-processors)</h2>
        <ul>
          <li>
            <strong>Supabase (EU region)</strong> — database, auth,
            object storage. Data Processing Agreement executed.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and
            cookieless analytics.
          </li>
          <li>
            <strong>MapTiler</strong> — map tiles and terrain. Receives
            only tile requests, not your account data.
          </li>
        </ul>
        <p>
          Some sub-processors may store backups outside the EEA. Transfers
          are covered by Standard Contractual Clauses (SCCs) approved by
          the European Commission.
        </p>
      </section>

      <section>
        <h2>5. Retention</h2>
        <ul>
          <li>Account data: kept while your account exists. Deleted within 30 days of account deletion request.</li>
          <li>Incidents you authored: kept while relevant, or up to 12 months after expiry.</li>
          <li>Server logs: up to 30 days.</li>
          <li>Votes: kept as anonymized counters; user links removed on account deletion.</li>
        </ul>
      </section>

      <section>
        <h2>6. Your rights (GDPR art. 15–22)</h2>
        <ul>
          <li><strong>Access</strong>: request a copy of your data.</li>
          <li><strong>Rectification</strong>: correct inaccurate data.</li>
          <li><strong>Erasure</strong> (&quot;right to be forgotten&quot;): delete your data.</li>
          <li><strong>Restriction</strong>: pause processing while disputing data accuracy.</li>
          <li><strong>Portability</strong>: receive your data in a machine-readable format.</li>
          <li><strong>Objection</strong>: object to processing based on legitimate interest.</li>
          <li><strong>Withdraw consent</strong>: at any time, where applicable.</li>
        </ul>
        <p>
          To exercise any right, email us. We reply within 30 days as
          required by art. 12 GDPR. You also have the right to lodge a
          complaint with the Spanish supervisory authority, the{' '}
          <strong>Agencia Española de Protección de Datos (AEPD)</strong>,
          at <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>.
        </p>
      </section>

      <section>
        <h2>7. Cookies</h2>
        <p>
          Montana uses only strictly necessary cookies (authentication
          session). No advertising or tracking cookies. See our{' '}
          <a href="/cookies">Cookie Policy</a> for the full list.
        </p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>
          Montana is not directed to children under 14. We do not
          knowingly collect personal data from anyone under 14 without
          parental consent, as required by art. 7 LOPDGDD.
        </p>
      </section>

      <section>
        <h2>9. Changes</h2>
        <p>
          We notify material changes via in-app notice and update the
          &quot;Last updated&quot; date above. Continued use after a
          change implies acceptance.
        </p>
      </section>
    </LegalPageLayout>
  );
}
