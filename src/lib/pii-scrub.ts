/**
 * Strips identifiable personal contact information from resume text before it
 * is sent to any LLM or third-party service. Claude only needs professional
 * experience — skills, projects, work history — not the candidate's contact
 * details.
 *
 * Intentionally NOT stripped:
 *   - Candidate's name (no reliable regex; prompt instructs the LLM not to
 *     reference personal identity)
 *   - GitHub URLs (technical portfolio, useful for question personalisation)
 *   - General technical URLs (documentation, project repos)
 *   - Employer / company names (essential context for questions)
 */
export function scrubResumePII(text: string): string {
  return text
    // Email addresses: user.name+tag@sub.domain.tld
    .replace(/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/g, '[email removed]')
    // Phone numbers with separators: (555) 123-4567, +91 98765 43210, 98765-43210
    .replace(/(\+\d{1,3}[\s.\-]?)?\(?\d{3,5}\)?[\s.\-]\d{3,5}[\s.\-]\d{3,5}/g, '[phone removed]')
    // E.164 compact international: +919876543210 (no separators)
    .replace(/\+\d{10,15}\b/g, '[phone removed]')
    // LinkedIn profile URLs
    .replace(/https?:\/\/(www\.)?linkedin\.com\/in\/[^\s,)"<]*/gi, '[linkedin removed]')
    // Twitter / X profile URLs
    .replace(/https?:\/\/(www\.)?(twitter|x)\.com\/[^\s,)"<]*/gi, '[social removed]')
    // Facebook profile URLs
    .replace(/https?:\/\/(www\.)?facebook\.com\/[^\s,)"<]*/gi, '[social removed]')
    // Instagram profile URLs
    .replace(/https?:\/\/(www\.)?instagram\.com\/[^\s,)"<]*/gi, '[social removed]')
}
