import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/interview/', '/account', '/api/', '/org'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
