import Link from 'next/link'
import { Mic } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — InterviewAI',
  description: 'How InterviewAI collects, uses, and protects your personal data.',
}

const LAST_UPDATED = 'June 2025'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
            <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Who We Are</h2>
            <p>
              InterviewAI (&quot;InterviewAI&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is an AI-powered mock
              interview platform operated by <strong>[Your Registered Legal Entity Name]</strong>,
              incorporated under the laws of India. Our platform helps job seekers practise
              interviews through voice-based AI conversations and receive detailed feedback reports.
            </p>
            <p className="mt-2">
              This Privacy Policy explains how we collect, use, share, and protect your personal
              data when you use our website and services at <strong>interviewai.in</strong> (the
              &quot;Platform&quot;). It is compliant with India&apos;s{' '}
              <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> and, where
              applicable, the EU&apos;s <strong>General Data Protection Regulation (GDPR)</strong>.
            </p>
            <p className="mt-2">
              By using the Platform, you acknowledge that you have read and understood this Privacy
              Policy and consent to the processing of your personal data as described herein.
            </p>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
              <strong>Geographic scope:</strong> InterviewAI is currently available exclusively
              to users in <strong>India</strong>. If you are accessing the Platform from outside
              India, please discontinue use until we announce availability in your region. We are
              working to expand globally and will update this policy when we do.
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Data We Collect and Why</h2>
            <p className="mb-3">
              We collect only what is necessary to provide the service. Here is a complete account
              of every category of personal data we hold:
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200 w-1/4">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200 w-1/4">Source</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Why We Need It</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Name, email address, profile photo', 'Google OAuth on sign-up', 'Create and identify your account; send you transactional emails (feedback reports, welcome email, streak reminders)'],
                    ['Spoken interview answers (audio transcripts)', 'Captured during live interview sessions', 'Evaluate your answers in real time; generate your feedback report; identify topics to practise'],
                    ['Job description, company name, role, years of experience', 'Entered by you during interview setup', 'Generate role-specific interview questions tailored to the target job'],
                    ['Resume / CV text', 'Optionally uploaded or pasted by you', 'Personalise questions to your actual projects and experience. Resume text is never stored in our database — it is processed in memory during question generation and then discarded.'],
                    ['Interview scores, strengths, gaps, feedback narrative', 'Generated by AI after each session', 'Show you your performance report; track your improvement over time; compute your Focus Areas on the dashboard'],
                    ['Practice streak and session history', 'System-generated', 'Display your progress on the dashboard; send you streak-at-risk reminder notifications'],
                    ['Payment identifiers (Razorpay order IDs)', 'Razorpay payment gateway', 'Verify payments and prevent duplicate credits. We do not store card numbers or bank details — these remain with Razorpay.'],
                    ['Browser push notification token', 'Browser Web Push API (only if you opt in)', 'Send you streak reminders and re-engagement notifications. You can revoke permission in your browser settings at any time.'],
                    ['App experience feedback (star rating + suggestions)', 'Optionally submitted after each session', 'Improve the product. Entirely optional.'],
                    ['Referral relationships (who referred whom)', 'Referral link clicks', 'Credit both parties when a referral converts to a completed interview'],
                  ].map(([data, source, why]) => (
                    <tr key={data}>
                      <td className="px-4 py-3 font-medium text-gray-800 align-top">{data}</td>
                      <td className="px-4 py-3 text-gray-600 align-top">{source}</td>
                      <td className="px-4 py-3 text-gray-600 align-top">{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Legal Basis for Processing</h2>
            <p className="mb-2">Under the DPDP Act and GDPR, we rely on the following legal grounds:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Consent</strong> — You actively sign in with Google and agree to these terms, thereby consenting to processing your name, email, interview content, and feedback.</li>
              <li><strong>Contract performance</strong> — We process payment identifiers and session data to fulfil the service you paid for.</li>
              <li><strong>Legitimate interests</strong> — We retain anonymised authentication records (without any personal profile data) to prevent system abuse (e.g., repeatedly claiming free credits). This retention is the minimum necessary and does not materially affect your privacy.</li>
              <li><strong>Legal obligation</strong> — Financial transaction records are retained for 7 years under Indian accounting and tax law, even after an account deletion request.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Third-Party Services That Receive Your Data</h2>
            <p className="mb-3">
              We use the following sub-processors. By using InterviewAI, you acknowledge that your
              data may be transferred to and processed by these services:
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Service</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Data Sent</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">Privacy Policy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['Anthropic (Claude)', 'Generate interview questions and evaluate answers', 'JD text, resume text (transient), interview transcripts, company/role', 'anthropic.com/privacy'],
                    ['Deepgram', 'Real-time speech-to-text transcription', 'Live audio stream from your microphone during the interview', 'deepgram.com/privacy'],
                    ['ElevenLabs', 'AI interviewer voice synthesis', 'Question text strings (no personal data)', 'elevenlabs.io/privacy'],
                    ['Supabase', 'Database and authentication', 'All account and interview data (hosted on Supabase infrastructure)', 'supabase.com/privacy'],
                    ['Resend', 'Transactional email delivery', 'Your name, email, and interview scores (for report email)', 'resend.com/privacy'],
                    ['Razorpay', 'Payment processing', 'Your user ID (in order notes); card/bank details are handled entirely by Razorpay and never reach our servers', 'razorpay.com/privacy'],
                    ['PostHog', 'Product analytics', 'Page view events and URLs (may include session IDs)', 'posthog.com/privacy'],
                    ['Sentry', 'Error monitoring', 'JavaScript error stack traces (may include page URLs)', 'sentry.io/privacy'],
                    ['Vercel', 'Application hosting', 'HTTP request logs (IP addresses, headers)', 'vercel.com/legal/privacy-policy'],
                  ].map(([service, purpose, data, policy]) => (
                    <tr key={service}>
                      <td className="px-4 py-3 font-medium text-gray-800 align-top">{service}</td>
                      <td className="px-4 py-3 text-gray-600 align-top">{purpose}</td>
                      <td className="px-4 py-3 text-gray-600 align-top">{data}</td>
                      <td className="px-4 py-3 text-gray-500 align-top">{policy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Active accounts:</strong> All personal data is retained for the lifetime of your account.</li>
              <li><strong>After account deletion — what is deleted:</strong> Your name, email address, profile photo, interview transcripts, spoken answer recordings, feedback reports, session history, focus area analysis, referral relationships, and push notification tokens are permanently deleted within 30 days of your request.</li>
              <li><strong>After account deletion — what is retained:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>Credit balance</strong> — retained so that if you return to the app, the credits you purchased are still available to you. Deleting your personal data does not forfeit credits you have purchased.</li>
                  <li><strong>Authentication record</strong> — a minimal technical record (no name, email, or profile data) is retained indefinitely to prevent the same identity from claiming the free signup credit a second time on re-registration.</li>
                  <li><strong>Financial transaction records (payment IDs)</strong> — retained for 7 years as required by the Income Tax Act 1961 and Companies Act 2013 (India). These records are already de-identified once your profile is scrubbed.</li>
                </ul>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Public Report Sharing</h2>
            <p>
              When you share your interview report, a unique link is generated (e.g.,{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">interviewai.in/report/abc123</code>).
              Anyone with this link can view your full report — including your scores, strengths, gaps,
              and quotes from your answers — without logging in.
            </p>
            <p className="mt-2">
              <strong>This link never expires.</strong> Share it only with people you trust. You cannot
              revoke a shared link once distributed, but you can delete your account to permanently
              remove the underlying report data (the link will then return a &ldquo;not found&rdquo; error).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Cookies and Analytics</h2>
            <p>
              We use session cookies set by Supabase to maintain your login state. We do not use
              advertising or third-party tracking cookies. PostHog analytics uses a first-party cookie
              stored in your browser&apos;s localStorage to count unique visitors. You can disable cookies
              in your browser settings, though this will prevent you from staying logged in.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Children&apos;s Privacy</h2>
            <p>
              InterviewAI is intended for users who are 18 years of age or older. We do not knowingly
              collect data from children under 18. If you believe a minor has created an account,
              please contact us immediately and we will delete the account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Data Security</h2>
            <p className="mb-2">
              We implement the following technical and organisational measures to protect your data:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is encrypted in transit (TLS 1.2+) and at rest (AES-256 via Supabase).</li>
              <li>Row-Level Security (RLS) ensures database queries are scoped to the authenticated user — you can only access your own data.</li>
              <li>Deepgram API keys issued to browsers are short-lived (2-hour expiry) and scoped to transcription only.</li>
              <li>Payment data never passes through our servers — card and bank details are handled entirely by Razorpay&apos;s PCI-DSS-compliant infrastructure.</li>
              <li>Access to production infrastructure is restricted to authorised personnel.</li>
            </ul>
            <p className="mt-2">
              In the event of a data breach that is likely to result in a risk to your rights, we will
              notify you and the relevant authorities within 72 hours as required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Your Rights</h2>
            <p className="mb-3">
              Under the DPDP Act 2023 and GDPR (where applicable), you have the following rights:
            </p>
            <div className="space-y-3">
              {[
                ['Right to Access', 'You can view all your personal data on your dashboard and account page. You may also contact us to request a full data export.'],
                ['Right to Correction', 'Your name and email are sourced from your Google account. To correct them, update your Google account and reconnect. Contact us for any other corrections.'],
                ['Right to Erasure ("Delete My Account")', null],
                ['Right to Data Portability', 'Contact us to request an export of your data in machine-readable format (JSON/CSV).'],
                ['Right to Withdraw Consent', 'You may withdraw consent at any time by deleting your account. This does not affect the lawfulness of processing carried out prior to withdrawal.'],
                ['Right to Lodge a Grievance (DPDP)', 'You may file a grievance with our Grievance Officer (see Section 12). If unresolved within 30 days, you may escalate to the Data Protection Board of India once constituted.'],
                ['Right to Lodge a Complaint (GDPR — EU users)', 'EU/EEA residents may lodge a complaint with their local supervisory authority.'],
              ].map(([title, body]) => (
                <div key={title} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="font-semibold text-gray-900 text-sm mb-1">{title}</div>
                  {title === 'Right to Erasure ("Delete My Account")' ? (
                    <div className="text-xs text-gray-600 space-y-1.5">
                      <p>
                        You can delete your personal data at any time from your{' '}
                        <Link href="/account" className="text-blue-600 hover:underline">Account Settings</Link>{' '}
                        page. The following is <strong>permanently deleted</strong>: your name, email,
                        profile photo, interview transcripts, feedback reports, session history, focus
                        area analysis, referral relationships, and push notification tokens.
                      </p>
                      <p>
                        The following is <strong>retained</strong> even after deletion, for the reasons
                        stated:
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Credit balance</strong> — so you do not lose credits you paid for. If you return, your remaining sessions are still available.</li>
                        <li><strong>Authentication record</strong> — to prevent re-granting of the free signup credit on re-registration (fraud prevention, legitimate interest).</li>
                        <li><strong>Payment transaction IDs</strong> — 7-year legal obligation under Indian financial law (see Section 5).</li>
                      </ul>
                    </div>
                  ) : body ? (
                    <p className="text-xs text-gray-600">{body}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Cross-Border Data Transfers</h2>
            <p>
              Your data may be processed by our sub-processors (Anthropic, Deepgram, ElevenLabs,
              Resend, Vercel) whose servers are located in the United States and other countries.
              These transfers are necessary to provide the service. We rely on the contractual
              safeguards provided by each sub-processor. By using the Platform, you consent to
              these transfers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Grievance Officer</h2>
            <p className="mb-3">
              As required under the DPDP Act 2023 and the IT Act 2000, we have designated a
              Grievance Officer to address any concerns regarding the processing of your personal data:
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm space-y-1">
              <div><span className="font-semibold text-gray-800">Name:</span> <span className="text-gray-700">[Grievance Officer Name]</span></div>
              <div><span className="font-semibold text-gray-800">Designation:</span> <span className="text-gray-700">Grievance Officer, InterviewAI</span></div>
              <div><span className="font-semibold text-gray-800">Email:</span> <a href="mailto:privacy@interviewai.in" className="text-blue-600 hover:underline">privacy@interviewai.in</a></div>
              <div><span className="font-semibold text-gray-800">Address:</span> <span className="text-gray-700">[Registered Office Address, India]</span></div>
              <div><span className="font-semibold text-gray-800">Response time:</span> <span className="text-gray-700">We will acknowledge within 48 hours and resolve within 30 days.</span></div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by email (if you have an active account) and by posting a notice on the Platform
              at least 14 days before the changes take effect. Your continued use of the Platform after
              that date constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">14. Contact Us</h2>
            <p>
              For any privacy-related questions, data export requests, or to exercise your rights,
              contact us at:{' '}
              <a href="mailto:privacy@interviewai.in" className="text-blue-600 hover:underline">
                privacy@interviewai.in
              </a>
            </p>
          </section>

          <div className="border-t border-gray-200 pt-6 text-xs text-gray-400">
            <p>
              This policy should be read alongside our{' '}
              <Link href="/terms" className="text-blue-500 hover:underline">Terms of Service</Link>.
            </p>
          </div>

        </div>
      </main>
    </div>
  )
}
