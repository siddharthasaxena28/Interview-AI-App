import type { RoundType } from '@/types'

export interface SampleQuestion {
  q: string
  tip: string
}

export interface PracticeGuide {
  slug: string
  company: string
  role: string
  roundType: RoundType
  roundLabel: string
  /** One-line meta description for SEO */
  metaDescription: string
  /** Intro paragraph shown on the page */
  intro: string
  skills: string[]
  difficulty: string
  avgScore: number
  sampleQuestions: SampleQuestion[]
}

// Curated, SEO-targeted practice guides for high-intent search queries
// like "Google software engineer interview questions".
export const PRACTICE_GUIDES: PracticeGuide[] = [
  {
    slug: 'google-software-engineer',
    company: 'Google',
    role: 'Software Engineer',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription:
      'Practice a free mock Google Software Engineer interview. Real voice questions on DSA, system design and behavioural rounds, with instant AI feedback.',
    intro:
      'Google software engineering interviews are famous for their depth in data structures, algorithms and system design. Interviewers care less about whether you reach the perfect answer and more about how you reason out loud, handle ambiguity and communicate trade-offs.',
    skills: ['Data structures', 'Algorithms', 'System design', 'Coding', 'Problem decomposition'],
    difficulty: '4–5 / 5',
    avgScore: 64,
    sampleQuestions: [
      { q: 'Design a URL shortener like TinyURL. Walk me through the data model and how you handle scale.', tip: 'Lead with requirements and scale estimates before jumping to the schema.' },
      { q: 'Given a stream of integers, how would you return the median at any point?', tip: 'Mention two heaps; explain why before you code.' },
      { q: 'Tell me about a time you disagreed with a senior engineer. How did you resolve it?', tip: 'Use STAR; focus on data-driven resolution, not who won.' },
    ],
  },
  {
    slug: 'amazon-sde',
    company: 'Amazon',
    role: 'SDE',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription:
      'Free mock Amazon SDE interview practice. Voice questions on coding, system design and the 16 Leadership Principles, with instant AI feedback.',
    intro:
      'Amazon interviews are built around the 16 Leadership Principles. Nearly every round — even technical ones — weaves in behavioural questions. Expect to back every claim with a specific story and quantified impact.',
    skills: ['Leadership Principles', 'Coding', 'System design', 'Ownership', 'Customer obsession'],
    difficulty: '4 / 5',
    avgScore: 61,
    sampleQuestions: [
      { q: 'Tell me about a time you took ownership of a problem outside your scope.', tip: 'Map it explicitly to the "Ownership" principle and quantify the outcome.' },
      { q: 'Design Amazon’s product recommendation system at a high level.', tip: 'Clarify scope first — are we ranking, retrieving, or both?' },
      { q: 'Describe a time you had to make a decision with incomplete data.', tip: 'Show bias for action while acknowledging the risk you accepted.' },
    ],
  },
  {
    slug: 'flipkart-software-engineer',
    company: 'Flipkart',
    role: 'Software Engineer',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription:
      'Practice a free mock Flipkart Software Engineer interview. Voice rounds on DSA, low-level design and scalability, with instant AI feedback.',
    intro:
      'Flipkart engineering interviews lean heavily on practical problem-solving, low-level design and handling India-scale traffic spikes like Big Billion Days. Expect machine-coding rounds and questions about real-world trade-offs.',
    skills: ['DSA', 'Low-level design', 'Concurrency', 'Scalability', 'Machine coding'],
    difficulty: '3–5 / 5',
    avgScore: 60,
    sampleQuestions: [
      { q: 'Design the checkout flow for a flash sale that gets 1 million requests in a minute.', tip: 'Talk about queuing, idempotency and inventory locking.' },
      { q: 'Implement an LRU cache. What is the time complexity of each operation?', tip: 'Explain the hashmap + doubly linked list combination clearly.' },
      { q: 'How would you design a rate limiter for our public API?', tip: 'Compare token bucket vs sliding window with concrete numbers.' },
    ],
  },
  {
    slug: 'tcs-software-developer',
    company: 'TCS',
    role: 'Software Developer',
    roundType: 'tech_l1',
    roundLabel: 'Technical Round 1',
    metaDescription:
      'Free mock TCS Software Developer interview practice. Voice questions on programming fundamentals, OOP, DBMS and projects, with instant AI feedback.',
    intro:
      'TCS technical interviews (including TCS NQT) focus on fundamentals: a programming language of your choice, OOP concepts, DBMS, and a deep dive into your resume projects. Clarity and confidence matter more than exotic algorithms.',
    skills: ['OOP', 'DBMS', 'SQL', 'Programming fundamentals', 'Project explanation'],
    difficulty: '2–3 / 5',
    avgScore: 71,
    sampleQuestions: [
      { q: 'Explain the four pillars of OOP with a real example from your project.', tip: 'Tie each pillar to actual code you wrote, not textbook definitions.' },
      { q: 'What is the difference between a primary key and a unique key?', tip: 'Mention nullability and that a table has one primary key but many unique keys.' },
      { q: 'Walk me through your final-year project and your specific contribution.', tip: 'Be specific about what YOU built versus the team.' },
    ],
  },
  {
    slug: 'infosys-systems-engineer',
    company: 'Infosys',
    role: 'Systems Engineer',
    roundType: 'tech_l1',
    roundLabel: 'Technical Round 1',
    metaDescription:
      'Free mock Infosys Systems Engineer interview practice. Voice questions on fundamentals, aptitude and HR fit, with instant AI feedback.',
    intro:
      'Infosys interviews for freshers blend technical fundamentals with a strong communication and adaptability check. They want engineers who can be trained and deployed across domains, so willingness to learn is assessed alongside core CS.',
    skills: ['Programming basics', 'DBMS', 'OS concepts', 'Communication', 'Adaptability'],
    difficulty: '2–3 / 5',
    avgScore: 73,
    sampleQuestions: [
      { q: 'What is normalization in databases and why does it matter?', tip: 'Explain 1NF–3NF briefly with the goal of reducing redundancy.' },
      { q: 'Are you comfortable relocating and working in any technology we assign?', tip: 'Show genuine flexibility — this is a real filter at Infosys.' },
      { q: 'What is the difference between a process and a thread?', tip: 'Mention shared memory and lighter context-switching for threads.' },
    ],
  },
  {
    slug: 'flipkart-product-manager',
    company: 'Flipkart',
    role: 'Product Manager',
    roundType: 'managerial',
    roundLabel: 'Managerial Round',
    metaDescription:
      'Free mock Flipkart Product Manager interview practice. Voice rounds on product sense, metrics and execution, with instant AI feedback.',
    intro:
      'Flipkart PM interviews test product sense, analytical depth and execution. Expect guesstimates, metric definition, and design questions rooted in the Indian e-commerce context — think tier-2 cities, vernacular users and cash-on-delivery.',
    skills: ['Product sense', 'Metrics & analytics', 'Prioritisation', 'Guesstimates', 'Execution'],
    difficulty: '3–5 / 5',
    avgScore: 58,
    sampleQuestions: [
      { q: 'How would you improve the Flipkart returns experience for a first-time tier-2 buyer?', tip: 'Anchor on a specific user persona and their trust barriers.' },
      { q: 'What metrics would you track for the Flipkart grocery vertical?', tip: 'Separate input metrics from the one north-star you optimise.' },
      { q: 'Estimate the number of orders Flipkart handles on a normal day.', tip: 'State assumptions out loud and sanity-check the final number.' },
    ],
  },
  {
    slug: 'zomato-data-analyst',
    company: 'Zomato',
    role: 'Data Analyst',
    roundType: 'tech_l1',
    roundLabel: 'Technical Round 1',
    metaDescription:
      'Free mock Zomato Data Analyst interview practice. Voice questions on SQL, metrics and case studies, with instant AI feedback.',
    intro:
      'Zomato data analyst interviews focus on SQL fluency, defining the right metrics, and reasoning through ambiguous business cases. You will be expected to translate a messy business question into a concrete, queryable answer.',
    skills: ['SQL', 'Metrics definition', 'A/B testing', 'Business case analysis', 'Data storytelling'],
    difficulty: '3–4 / 5',
    avgScore: 62,
    sampleQuestions: [
      { q: 'Write a SQL query to find the top 3 restaurants by revenue in each city.', tip: 'Reach for a window function (ROW_NUMBER over a partition).' },
      { q: 'Orders dropped 8% last week. How do you investigate?', tip: 'Segment by city, time, platform and funnel step before guessing.' },
      { q: 'How would you measure the success of a new "10-minute delivery" feature?', tip: 'Balance speed metrics against cancellation and unit economics.' },
    ],
  },
  {
    slug: 'accenture-associate-software-engineer',
    company: 'Accenture',
    role: 'Associate Software Engineer',
    roundType: 'hr',
    roundLabel: 'HR Round',
    metaDescription:
      'Free mock Accenture Associate Software Engineer HR interview practice. Voice questions on fit, relocation and motivation, with instant AI feedback.',
    intro:
      'The Accenture HR round checks communication, cultural fit and logistics like relocation, shifts and notice period. It is rarely about technology — it is about whether you will be a reliable, professional team member.',
    skills: ['Communication', 'Cultural fit', 'Flexibility', 'Self-awareness', 'Professionalism'],
    difficulty: '1–2 / 5',
    avgScore: 76,
    sampleQuestions: [
      { q: 'Tell me about yourself.', tip: 'Keep it to 60–90 seconds: present, past, why this role.' },
      { q: 'Are you open to working in rotational shifts and relocating?', tip: 'Be honest but show flexibility — this is a genuine filter.' },
      { q: 'Where do you see yourself in five years?', tip: 'Align your growth with a path that exists at the company.' },
    ],
  },
  {
    slug: 'zomato-product-manager',
    company: 'Zomato',
    role: 'Product Manager',
    roundType: 'managerial',
    roundLabel: 'Managerial Round',
    metaDescription: 'Practice a free mock Zomato Product Manager interview. Voice questions on product strategy, metrics, execution and stakeholder management, with AI feedback.',
    intro: 'Zomato PM interviews focus on first-principles thinking, data-driven decision-making, and comfort with ambiguity in a hyper-growth consumer internet company. Interviewers test whether you can balance speed with quality, and whether you understand the restaurant–delivery–consumer triangle.',
    skills: ['Product strategy', 'Metrics', 'Execution', 'User empathy', 'Data analysis'],
    difficulty: '4 / 5',
    avgScore: 59,
    sampleQuestions: [
      { q: 'Zomato\'s order cancellation rate has increased 15% this month. How do you diagnose it?', tip: 'Break down by funnel stage, user segment, city, and time — don\'t jump to solutions.' },
      { q: 'How would you improve the Zomato Gold subscription product?', tip: 'Start with current user pain points before proposing features.' },
      { q: 'Tell me about a time you had to make a product decision with limited data.', tip: 'Show how you used proxies and user signals to de-risk the call.' },
    ],
  },
  {
    slug: 'razorpay-software-engineer',
    company: 'Razorpay',
    role: 'Software Engineer',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription: 'Practice a free mock Razorpay Software Engineer interview. Voice rounds on payments systems, distributed architecture and coding, with AI feedback.',
    intro: 'Razorpay engineering interviews test deep knowledge of distributed systems and payment infrastructure. Expect questions on consistency, idempotency, and fault tolerance — the core properties that matter when you\'re processing millions of rupees per day.',
    skills: ['Distributed systems', 'Payment systems', 'Idempotency', 'Concurrency', 'System design'],
    difficulty: '4–5 / 5',
    avgScore: 58,
    sampleQuestions: [
      { q: 'How would you design a payment gateway that guarantees exactly-once payment processing?', tip: 'Cover idempotency keys, two-phase commit, and reconciliation.' },
      { q: 'How do you handle a situation where a bank API is slow but your dashboard must show real-time status?', tip: 'Talk about event-driven architecture, caching, and graceful degradation.' },
      { q: 'Describe your approach to debugging a production issue where 2% of payments are failing silently.', tip: 'Structured logging, tracing, and building a reproduction plan first.' },
    ],
  },
  {
    slug: 'infosys-software-engineer',
    company: 'Infosys',
    role: 'Software Engineer',
    roundType: 'tech_l1',
    roundLabel: 'Technical Round 1',
    metaDescription: 'Practice a free mock Infosys Software Engineer interview. Voice rounds on core CS fundamentals, OOPS, SQL, and behavioural questions, with AI feedback.',
    intro: 'Infosys technical interviews for freshers and experienced hires test core computer science fundamentals: OOP, data structures, SQL, and reasoning ability. The style is structured and predictable — solid preparation on fundamentals goes a long way.',
    skills: ['OOP concepts', 'Data structures', 'SQL', 'Algorithms', 'Reasoning'],
    difficulty: '2–3 / 5',
    avgScore: 68,
    sampleQuestions: [
      { q: 'Explain the four pillars of object-oriented programming with a real-world example.', tip: 'Use concrete analogies — a Vehicle class, a Bank Account — not abstract definitions.' },
      { q: 'Write a SQL query to find the second-highest salary from an employees table.', tip: 'Know both the subquery approach and the DENSE_RANK() window function approach.' },
      { q: 'What is the difference between a process and a thread? When would you use multithreading?', tip: 'Anchor your answer with a real example like a web server or download manager.' },
    ],
  },
  {
    slug: 'swiggy-software-engineer',
    company: 'Swiggy',
    role: 'Software Engineer',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription: 'Practice a free mock Swiggy Software Engineer interview. Voice rounds on high-scale backend design, real-time systems, and coding, with AI feedback.',
    intro: 'Swiggy engineering interviews are highly practical — they test your ability to reason about real-time order dispatching, location services, and surge pricing at scale. Expect both coding rounds and system design questions with India-specific traffic and reliability constraints.',
    skills: ['System design', 'Real-time processing', 'Geospatial systems', 'Distributed systems', 'Algorithms'],
    difficulty: '4 / 5',
    avgScore: 60,
    sampleQuestions: [
      { q: 'Design Swiggy\'s delivery partner assignment system. How do you match orders to the nearest available partner at scale?', tip: 'Cover geospatial indexing (geohashing or quadtrees), assignment algorithms, and what happens during peak hours.' },
      { q: 'How would you implement real-time order tracking that updates every few seconds for millions of concurrent orders?', tip: 'WebSockets vs server-sent events, how to fan-out location updates efficiently.' },
      { q: 'Tell me about the most complex distributed systems problem you have solved.', tip: 'Focus on the trade-off you faced and how you measured success.' },
    ],
  },
  {
    slug: 'phonepe-software-engineer',
    company: 'PhonePe',
    role: 'Software Engineer',
    roundType: 'tech_l2',
    roundLabel: 'Technical Round 2',
    metaDescription: 'Practice a free mock PhonePe Software Engineer interview. Voice rounds on fintech backend systems, UPI infrastructure, and high-scale design, with AI feedback.',
    intro: 'PhonePe engineering interviews are heavy on distributed systems for UPI and financial infrastructure. They value engineers who understand high availability, transaction consistency, and the unique challenges of building on India\'s payment stack.',
    skills: ['Fintech systems', 'High availability', 'Transactions', 'Microservices', 'UPI/NPCI stack'],
    difficulty: '4–5 / 5',
    avgScore: 57,
    sampleQuestions: [
      { q: 'How would you design a UPI transaction system that handles 1 billion transactions per day?', tip: 'Cover NPCI integration, timeout handling, reconciliation, and the retry strategy.' },
      { q: 'What strategy would you use to ensure zero data loss during a database failover for financial transactions?', tip: 'Talk about synchronous replication, WAL, and how you validate consistency post-failover.' },
      { q: 'How do you design a fraud detection system that makes decisions in under 100ms?', tip: 'Feature engineering in real-time, rule engines vs ML models, and the fallback path.' },
    ],
  },
  {
    slug: 'deloitte-analyst',
    company: 'Deloitte',
    role: 'Analyst',
    roundType: 'hr',
    roundLabel: 'HR Round',
    metaDescription: 'Practice a free mock Deloitte Analyst interview. Voice rounds on competency questions, client communication, and consulting fit, with AI feedback.',
    intro: 'Deloitte analyst interviews blend HR competency questions with light situational / case thinking. They look for communication clarity, teamwork, and the ability to handle ambiguity — standard consulting virtues, tested through your personal stories.',
    skills: ['Communication', 'Teamwork', 'Problem solving', 'Client focus', 'Adaptability'],
    difficulty: '2–3 / 5',
    avgScore: 66,
    sampleQuestions: [
      { q: 'Why Deloitte over the other Big Four? What specifically appeals to you about our practice areas?', tip: 'Do your research — mention a specific service line or industry practice.' },
      { q: 'Describe a time you had to work with a difficult team member on a tight deadline. How did you handle it?', tip: 'Use STAR and focus on the outcome, not the complaint.' },
      { q: 'How do you prioritise when you have three deliverables due at the same time?', tip: 'Show structured thinking — impact, effort, stakeholder urgency.' },
    ],
  },
]

export function getGuide(slug: string): PracticeGuide | undefined {
  return PRACTICE_GUIDES.find((g) => g.slug === slug)
}
