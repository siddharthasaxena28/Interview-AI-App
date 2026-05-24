import Link from 'next/link'
import { Mic } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: May 25, 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">1. Information We Collect</h2>
            <p>We collect information you provide: your name, email address (via Google OAuth), interview transcripts, and payment information (processed by Razorpay — we do not store card details).</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">2. How We Use Your Information</h2>
            <p>Your interview transcripts are processed by Anthropic Claude API solely to generate personalised questions and feedback. They are stored securely in our database and are not used to train AI models. You can request deletion at any time.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">3. Voice Data</h2>
            <p>Voice audio is processed in real-time by Deepgram for speech transcription. Audio is not stored. Only the text transcript is saved to our database.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">4. Data Security</h2>
            <p>All data is stored in Supabase with Row Level Security enabled. Each user can only access their own data. All communication is encrypted via HTTPS.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-gray-900">5. Contact</h2>
            <p>For privacy concerns, email us at privacy@interviewai.in</p>
          </section>
        </div>
      </main>
    </div>
  )
}
