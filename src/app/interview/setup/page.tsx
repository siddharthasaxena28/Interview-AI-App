'use client'

import { useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mic, ArrowRight, ArrowLeft, Loader2, Upload, Link, FileText, X } from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'
import type { RoundType } from '@/types'

interface FormData {
  jd_text: string
  company: string
  role: string
  experience_years: number
  round_type: RoundType
  resume_text: string
}

type ResumeTab = 'text' | 'file' | 'drive'

const RESUME_TABS: { key: ResumeTab; label: string }[] = [
  { key: 'text', label: 'Paste text' },
  { key: 'file', label: 'Upload file' },
  { key: 'drive', label: 'Google Drive' },
]

const ROUND_OPTIONS: { value: RoundType; label: string; desc: string }[] = [
  { value: 'tech_l1', label: 'Technical Round 1', desc: 'Fundamentals, coding basics, conceptual questions' },
  { value: 'tech_l2', label: 'Technical Round 2', desc: 'System design, architecture, deep technical' },
  { value: 'managerial', label: 'Managerial Round', desc: 'Leadership, STAR method, strategic thinking' },
  { value: 'hr', label: 'HR Round', desc: 'Culture fit, CTC, notice period, motivation' },
  { value: 'full_loop', label: 'Full Interview Loop', desc: 'All rounds back-to-back (60 minutes)' },
]

function SetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const analytics = useAnalytics()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resumeTab, setResumeTab] = useState<ResumeTab>('text')
  const [resumeParsing, setResumeParsing] = useState(false)
  const [resumeFileName, setResumeFileName] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pre-fill round_type from query param (e.g. from "Practice This" on dashboard)
  const prefillRoundType = (searchParams.get('round_type') as RoundType | null) ?? 'tech_l1'
  const validRoundTypes: RoundType[] = ['tech_l1', 'tech_l2', 'managerial', 'hr', 'full_loop']
  const initialRoundType = validRoundTypes.includes(prefillRoundType) ? prefillRoundType : 'tech_l1'

  const [form, setForm] = useState<FormData>({
    jd_text: '',
    company: '',
    role: '',
    experience_years: 0,
    round_type: initialRoundType,
    resume_text: '',
  })

  function updateForm(field: keyof FormData, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeParsing(true)
    setResumeFileName(file.name)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/parse-resume', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to parse file')
      updateForm('resume_text', data.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse resume file.')
      setResumeFileName('')
    } finally {
      setResumeParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDriveImport() {
    if (!driveUrl.trim()) return
    setResumeParsing(true)
    setError('')
    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: driveUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to import from Google Drive')
      updateForm('resume_text', data.text)
      setResumeFileName('Imported from Google Drive')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from Google Drive.')
    } finally {
      setResumeParsing(false)
    }
  }

  function clearResume() {
    updateForm('resume_text', '')
    setResumeFileName('')
    setDriveUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function validateStep1() {
    if (form.jd_text.trim().length < 100) {
      setError('Please paste the full job description (at least 100 characters).')
      return false
    }
    if (form.jd_text.length > 5000) {
      setError('Job description too long. Please keep it under 5,000 characters.')
      return false
    }
    return true
  }

  function validateStep2() {
    if (!form.company.trim()) {
      setError('Please enter the company name.')
      return false
    }
    if (!form.role.trim()) {
      setError('Please enter the job role.')
      return false
    }
    return true
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    analytics.capture('setup_submitted', {
      round_type: form.round_type,
      company: form.company,
      experience_years: form.experience_years,
    })

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to generate questions')
      }

      const { session_id } = await res.json()
      analytics.capture('questions_generated', {
        round_type: form.round_type,
        company: form.company,
        session_id,
      })
      router.push(`/interview/briefing/${session_id}`)
    } catch (err) {
      analytics.capture('setup_error', { error: err instanceof Error ? err.message : 'unknown' })
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">InterviewAI</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 3 && <div className={`h-0.5 w-12 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm text-gray-500">
            {step === 1 && 'Job Description'}
            {step === 2 && 'Company & Role'}
            {step === 3 && 'Round Type'}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          {/* Step 1: JD */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Paste the Job Description</h2>
              <p className="text-sm text-gray-500 mb-6">
                Our AI will analyse it to generate targeted, company-specific questions.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Description
                <span className="text-gray-400 font-normal ml-1">
                  ({form.jd_text.length}/5000 characters)
                </span>
              </label>
              <textarea
                value={form.jd_text}
                onChange={(e) => updateForm('jd_text', e.target.value)}
                placeholder="Paste the full job description here. Include required skills, responsibilities, and company information for best results..."
                maxLength={5000}
                rows={12}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          )}

          {/* Step 2: Company & Role */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Company & Role Details</h2>
              <p className="text-sm text-gray-500 mb-6">
                Help our AI research what this company specifically looks for.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => updateForm('company', e.target.value)}
                    placeholder="e.g. Google, Flipkart, Tata Consultancy Services"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Role / Position</label>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => updateForm('role', e.target.value)}
                    placeholder="e.g. Senior Software Engineer, Product Manager, Data Analyst"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Years of Experience</label>
                  <select
                    value={form.experience_years}
                    onChange={(e) => updateForm('experience_years', parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={0}>Fresher / 0 years</option>
                    <option value={1}>1 year</option>
                    <option value={2}>2 years</option>
                    <option value={3}>3 years</option>
                    <option value={4}>4 years</option>
                    <option value={5}>5 years</option>
                    <option value={7}>6–8 years</option>
                    <option value={10}>9–12 years</option>
                    <option value={15}>13+ years</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your résumé
                    <span className="text-gray-400 font-normal ml-1">(optional — makes questions personal)</span>
                  </label>

                  {/* Tab selector */}
                  <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
                    {RESUME_TABS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setResumeTab(key)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          resumeTab === key
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Paste text */}
                  {resumeTab === 'text' && (
                    <textarea
                      value={form.resume_text}
                      onChange={(e) => updateForm('resume_text', e.target.value)}
                      placeholder="Paste your résumé text here. The AI will ask about your actual projects, skills, and experience — just like a real interviewer who has read your CV."
                      maxLength={8000}
                      rows={5}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  )}

                  {/* Upload file */}
                  {resumeTab === 'file' && (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      {resumeFileName && resumeTab === 'file' ? (
                        <div className="flex items-center gap-2 border border-green-200 bg-green-50 rounded-xl px-4 py-3">
                          <FileText className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="text-sm text-green-800 truncate flex-1">{resumeFileName}</span>
                          <button type="button" onClick={clearResume} className="text-green-600 hover:text-green-800">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={resumeParsing}
                          className="w-full border-2 border-dashed border-gray-200 rounded-xl px-4 py-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                          {resumeParsing ? (
                            <div className="flex flex-col items-center gap-2 text-blue-600">
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <span className="text-sm font-medium">Parsing résumé…</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-gray-400">
                              <Upload className="w-6 h-6" />
                              <span className="text-sm font-medium text-gray-600">Click to upload PDF or Word file</span>
                              <span className="text-xs">.pdf, .doc, .docx — max 5 MB</span>
                            </div>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Google Drive */}
                  {resumeTab === 'drive' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        Share your résumé in Google Drive or Google Docs as <strong>&quot;Anyone with the link&quot;</strong>, then paste the share URL below.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={driveUrl}
                          onChange={(e) => setDriveUrl(e.target.value)}
                          placeholder="https://drive.google.com/file/d/… or docs.google.com/document/d/…"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleDriveImport}
                          disabled={resumeParsing || !driveUrl.trim()}
                          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resumeParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                          Import
                        </button>
                      </div>
                      {resumeFileName === 'Imported from Google Drive' && (
                        <div className="flex items-center gap-2 border border-green-200 bg-green-50 rounded-xl px-4 py-2.5">
                          <FileText className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 flex-1">Imported from Google Drive</span>
                          <button type="button" onClick={clearResume} className="text-green-600 hover:text-green-800">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 mt-1.5">
                    {form.resume_text.length > 0
                      ? `${form.resume_text.length} characters extracted — questions will reference your background`
                      : 'Skip this and questions are generated from the job description alone.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Round Type */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Choose Your Interview Round</h2>
              <p className="text-sm text-gray-500 mb-6">
                Each round has a different AI interviewer with a distinct style.
              </p>
              <div className="space-y-3">
                {ROUND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateForm('round_type', option.value)}
                    className={`w-full text-left border rounded-xl px-4 py-4 transition-colors ${
                      form.round_type === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          form.round_type === option.value ? 'border-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {form.round_type === option.value && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{option.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{option.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={() => { setStep(step - 1); setError('') }}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                onClick={() => {
                  const valid = step === 1 ? validateStep1() : validateStep2()
                  if (valid) setStep(step + 1)
                }}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating questions…
                  </>
                ) : (
                  <>Generate Interview Questions <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Question generation usually takes 10–15 seconds
        </p>
      </div>
    </div>
  )
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <SetupPageInner />
    </Suspense>
  )
}
