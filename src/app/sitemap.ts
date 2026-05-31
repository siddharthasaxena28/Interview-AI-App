import { MetadataRoute } from 'next'
import { PRACTICE_GUIDES } from '@/lib/practice-content'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'
  const now = new Date()

  const practiceUrls: MetadataRoute.Sitemap = PRACTICE_GUIDES.map((g) => ({
    url: `${base}/practice/${g.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/practice`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/auth/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    ...practiceUrls,
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ]
}
