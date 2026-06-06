import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from './providers'
import PWARegister from './PWARegister'
import PageTransition from '@/components/PageTransition'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'InterviewAI — Practice like it\'s real. Perform when it matters.',
    template: '%s | InterviewAI',
  },
  description: 'AI-powered voice mock interview platform for the Indian job market. Practice full telephonic interview rounds — Technical L1/L2, Managerial, HR — with real-time AI feedback and detailed scorecards.',
  keywords: [
    'mock interview', 'AI interview', 'job interview practice', 'India',
    'voice interview', 'telephonic interview practice', 'technical interview',
    'TCS interview', 'Infosys interview', 'Wipro interview', 'Accenture interview',
    'Flipkart interview', 'Amazon India interview', 'Swiggy interview', 'Zepto interview',
    'Google India', 'Microsoft India', 'interview preparation', 'software engineer interview',
    'HR round practice', 'managerial round', 'AI feedback', 'selection probability',
    'placement preparation', 'campus placement', 'fresher interview', 'interview coaching',
  ],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/icon.svg', type: 'image/svg+xml' },
    shortcut: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'InterviewAI',
  },
  openGraph: {
    title: 'InterviewAI — Practice like it\'s real. Perform when it matters.',
    description: 'AI voice mock interviews for the Indian job market. Get JD-specific questions, real-time feedback, and a detailed scorecard.',
    type: 'website',
    url: APP_URL,
    siteName: 'InterviewAI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InterviewAI — Practice like it\'s real.',
    description: 'AI voice mock interviews for the Indian job market. JD-specific questions, real-time feedback, selection probability score.',
  },
  alternates: {
    canonical: APP_URL,
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${APP_URL}/#website`,
      url: APP_URL,
      name: 'InterviewAI',
      description: 'AI-powered voice mock interview platform for the Indian job market.',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${APP_URL}/interview/setup` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${APP_URL}/#app`,
      name: 'InterviewAI',
      url: APP_URL,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
        description: '1 free mock interview session included',
      },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <PostHogProvider>
          <PageTransition>
            {children}
          </PageTransition>
        </PostHogProvider>
        <PWARegister />
      </body>
    </html>
  )
}
