import type { RoundType } from '@/types'

export interface DrillQuestion {
  id: number
  text: string
  roundType: RoundType
  topicTag: string
  difficulty: number
}

export const DRILL_QUESTIONS: DrillQuestion[] = [
  // ── Tech L1 ──────────────────────────────────────────────────────────────
  { id: 1, roundType: 'tech_l1', topicTag: 'data_structures', difficulty: 2, text: 'What is the difference between an array and a linked list? When would you choose one over the other?' },
  { id: 2, roundType: 'tech_l1', topicTag: 'algorithms', difficulty: 2, text: 'Explain Big O notation. What is the time complexity of binary search?' },
  { id: 3, roundType: 'tech_l1', topicTag: 'networking', difficulty: 2, text: 'What is the difference between TCP and UDP? Give a real-world use case for each.' },
  { id: 4, roundType: 'tech_l1', topicTag: 'data_structures', difficulty: 2, text: 'How does a hash table work? What happens when two keys produce the same hash?' },
  { id: 5, roundType: 'tech_l1', topicTag: 'data_structures', difficulty: 1, text: 'What is the difference between a stack and a queue? Give an example use case for each.' },
  { id: 6, roundType: 'tech_l1', topicTag: 'problem_solving', difficulty: 2, text: 'Explain recursion. What is a base case and why is it critical?' },
  { id: 7, roundType: 'tech_l1', topicTag: 'system_basics', difficulty: 2, text: 'What is a REST API? List its key principles.' },
  { id: 8, roundType: 'tech_l1', topicTag: 'system_basics', difficulty: 2, text: 'What is the difference between SQL and NoSQL databases? When would you pick each?' },
  { id: 9, roundType: 'tech_l1', topicTag: 'system_basics', difficulty: 3, text: 'Explain what a deadlock is. How do you prevent it?' },
  { id: 10, roundType: 'tech_l1', topicTag: 'code_quality', difficulty: 2, text: 'What is the difference between git merge and git rebase?' },
  { id: 11, roundType: 'tech_l1', topicTag: 'code_quality', difficulty: 3, text: 'Explain the SOLID principles. Give an example of the Single Responsibility Principle.' },
  { id: 12, roundType: 'tech_l1', topicTag: 'system_basics', difficulty: 2, text: 'What is the difference between synchronous and asynchronous programming? Why does it matter for APIs?' },
  { id: 13, roundType: 'tech_l1', topicTag: 'fundamentals', difficulty: 2, text: 'What is caching? Give an example of where you would use it in a web application.' },
  { id: 14, roundType: 'tech_l1', topicTag: 'system_basics', difficulty: 2, text: 'What is the difference between a process and a thread?' },
  { id: 15, roundType: 'tech_l1', topicTag: 'debugging', difficulty: 2, text: 'Walk me through how you would debug a production issue where an API is returning 500 errors.' },

  // ── Tech L2 ──────────────────────────────────────────────────────────────
  { id: 16, roundType: 'tech_l2', topicTag: 'system_design', difficulty: 4, text: 'Design a URL shortener service like bit.ly. Walk me through the key components and trade-offs.' },
  { id: 17, roundType: 'tech_l2', topicTag: 'scalability', difficulty: 4, text: 'How would you design a push notification system to handle 50 million users?' },
  { id: 18, roundType: 'tech_l2', topicTag: 'architecture', difficulty: 3, text: 'What does a load balancer do? What are the different load-balancing strategies?' },
  { id: 19, roundType: 'tech_l2', topicTag: 'distributed_systems', difficulty: 4, text: 'Explain the CAP theorem. What trade-offs does it force on distributed system design?' },
  { id: 20, roundType: 'tech_l2', topicTag: 'architecture', difficulty: 4, text: 'How would you design a rate limiter? Describe two different algorithms for it.' },
  { id: 21, roundType: 'tech_l2', topicTag: 'distributed_systems', difficulty: 4, text: 'What is eventual consistency? When is it acceptable, and when is it not?' },
  { id: 22, roundType: 'tech_l2', topicTag: 'performance', difficulty: 3, text: 'How does a CDN work? When would you use one, and what are its limitations?' },
  { id: 23, roundType: 'tech_l2', topicTag: 'databases', difficulty: 4, text: 'What is database sharding? What are the main trade-offs compared to vertical scaling?' },
  { id: 24, roundType: 'tech_l2', topicTag: 'system_design', difficulty: 5, text: 'How would you design a real-time chat system? Focus on message delivery guarantees.' },
  { id: 25, roundType: 'tech_l2', topicTag: 'scalability', difficulty: 3, text: 'What is the difference between horizontal and vertical scaling? When do you hit the limits of each?' },
  { id: 26, roundType: 'tech_l2', topicTag: 'architecture', difficulty: 4, text: 'What is the circuit breaker pattern? When and why would you use it?' },
  { id: 27, roundType: 'tech_l2', topicTag: 'architecture', difficulty: 3, text: 'What is the difference between microservices and a monolith? What are the key trade-offs?' },
  { id: 28, roundType: 'tech_l2', topicTag: 'databases', difficulty: 4, text: 'How would you perform a database migration on a live system with zero downtime?' },
  { id: 29, roundType: 'tech_l2', topicTag: 'security', difficulty: 3, text: 'What is SQL injection? How do you prevent it?' },
  { id: 30, roundType: 'tech_l2', topicTag: 'performance', difficulty: 3, text: 'Explain the difference between a message queue and a message broker. Give a real-world use case.' },

  // ── Managerial ───────────────────────────────────────────────────────────
  { id: 31, roundType: 'managerial', topicTag: 'leadership', difficulty: 3, text: 'Tell me about a time you had to give difficult feedback to a team member. What was the outcome?' },
  { id: 32, roundType: 'managerial', topicTag: 'stakeholder_management', difficulty: 3, text: 'Describe a situation where you had conflicting priorities from multiple stakeholders. How did you resolve it?' },
  { id: 33, roundType: 'managerial', topicTag: 'decision_making', difficulty: 4, text: 'Tell me about a time you had to make a significant decision with incomplete information.' },
  { id: 34, roundType: 'managerial', topicTag: 'team_management', difficulty: 3, text: 'How do you keep a team motivated during a long, challenging project?' },
  { id: 35, roundType: 'managerial', topicTag: 'project_delivery', difficulty: 4, text: 'Describe the most complex project you have delivered. What made it complex and how did you navigate it?' },
  { id: 36, roundType: 'managerial', topicTag: 'team_management', difficulty: 3, text: 'How do you handle a consistently underperforming team member?' },
  { id: 37, roundType: 'managerial', topicTag: 'ownership', difficulty: 3, text: 'Describe your approach to delegation. How do you decide what to delegate and what to keep?' },
  { id: 38, roundType: 'managerial', topicTag: 'cross_functional', difficulty: 4, text: 'Tell me about a time you had to influence an outcome without having direct authority.' },
  { id: 39, roundType: 'managerial', topicTag: 'conflict_resolution', difficulty: 3, text: 'How do you handle a direct disagreement with your manager or a senior stakeholder?' },
  { id: 40, roundType: 'managerial', topicTag: 'decision_making', difficulty: 3, text: 'How do you prioritize when everything seems equally urgent?' },
  { id: 41, roundType: 'managerial', topicTag: 'mentoring', difficulty: 3, text: 'How do you build trust quickly with a new team?' },
  { id: 42, roundType: 'managerial', topicTag: 'strategy', difficulty: 4, text: 'Tell me about a failed project. What went wrong and what would you do differently?' },
  { id: 43, roundType: 'managerial', topicTag: 'leadership', difficulty: 3, text: 'Describe a time when you had to adapt your leadership style to a specific person or situation.' },

  // ── HR ───────────────────────────────────────────────────────────────────
  { id: 44, roundType: 'hr', topicTag: 'behavioral', difficulty: 1, text: 'Tell me about yourself — your background, your current role, and what brought you here today.' },
  { id: 45, roundType: 'hr', topicTag: 'motivation', difficulty: 2, text: 'Why are you looking to leave your current company?' },
  { id: 46, roundType: 'hr', topicTag: 'salary_negotiation', difficulty: 2, text: 'What are your salary expectations for this role? Walk me through your thought process.' },
  { id: 47, roundType: 'hr', topicTag: 'career_goals', difficulty: 2, text: 'Where do you see yourself in five years?' },
  { id: 48, roundType: 'hr', topicTag: 'notice_period', difficulty: 1, text: 'What is your current notice period, and can it be shortened if needed?' },
  { id: 49, roundType: 'hr', topicTag: 'strengths_weaknesses', difficulty: 2, text: 'What is your biggest professional weakness? Give a specific example.' },
  { id: 50, roundType: 'hr', topicTag: 'company_research', difficulty: 2, text: 'Why do you specifically want to join our company? What do you know about us?' },
  { id: 51, roundType: 'hr', topicTag: 'work_style', difficulty: 2, text: 'How do you maintain work-life balance when dealing with high workloads or tight deadlines?' },
  { id: 52, roundType: 'hr', topicTag: 'behavioral', difficulty: 2, text: 'Tell me about a time you worked under significant pressure. How did you handle it?' },
  { id: 53, roundType: 'hr', topicTag: 'culture_fit', difficulty: 2, text: 'How do you handle disagreements with a colleague? Give a specific example.' },
  { id: 54, roundType: 'hr', topicTag: 'role_clarity', difficulty: 2, text: 'What specific things are you looking for in your next role that you are not getting now?' },
  { id: 55, roundType: 'hr', topicTag: 'behavioral', difficulty: 2, text: 'Tell me about a time you showed initiative and took ownership beyond your job description.' },
  { id: 56, roundType: 'hr', topicTag: 'strengths_weaknesses', difficulty: 2, text: 'What are your top two strengths and how have you applied them at work recently?' },
  { id: 57, roundType: 'hr', topicTag: 'motivation', difficulty: 2, text: 'What motivates you to do your best work every day?' },
  { id: 58, roundType: 'hr', topicTag: 'behavioral', difficulty: 2, text: 'Describe a situation where you had to quickly learn something new to complete a task.' },
]

export type DrillRoundFilter = RoundType | 'mixed'

// Pick 3 questions for a given date + filter, consistent within a day.
export function getDailyDrillQuestions(
  date: string,
  filter: DrillRoundFilter = 'mixed'
): DrillQuestion[] {
  const pool = filter === 'mixed'
    ? DRILL_QUESTIONS
    : DRILL_QUESTIONS.filter(q => q.roundType === filter)

  // Simple deterministic shuffle from date string (so same 3 questions all day)
  const seed = date.split('-').reduce((acc, n) => acc * 31 + parseInt(n, 10), 0)
  const shuffled = [...pool].sort((a, b) => {
    const ha = ((a.id * 1103515245 + seed) >>> 0) % 65536
    const hb = ((b.id * 1103515245 + seed) >>> 0) % 65536
    return ha - hb
  })
  return shuffled.slice(0, 3)
}
