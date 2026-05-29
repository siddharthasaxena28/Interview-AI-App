import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from './providers'
import PWARegister from './PWARegister'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'InterviewAI — Practice like it\'s real. Perform when it matters.',
  description: 'AI-powered voice mock interview platform for the Indian job market. Practice full interview rounds with real-time AI feedback.',
  keywords: 'mock interview, AI interview, job interview practice, India, voice interview',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'InterviewAI',
  },
  openGraph: {
    title: 'InterviewAI',
    description: 'Practice like it\'s real. Perform when it matters.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <PWARegister />
      </body>
    </html>
  )
}
