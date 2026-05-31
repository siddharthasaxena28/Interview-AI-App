-- One-time cleanup: remap or delete weak_areas rows whose topic_tag is not in
-- the controlled vocabulary introduced in generate-questions/route.ts.
--
-- Run this once in the Supabase SQL editor. It is safe to re-run (idempotent).

-- Step 1: remap tags that are close enough to a canonical tag.
UPDATE public.weak_areas
SET topic_tag = CASE
  -- HR tags (free-form → canonical)
  WHEN lower(topic_tag) IN ('company fit', 'company_fit', 'cultural fit', 'cultural_fit') THEN 'culture_fit'
  WHEN lower(topic_tag) IN ('closing', 'close', 'wrap up', 'wrap_up', 'wrap-up')          THEN 'behavioral'
  WHEN lower(topic_tag) IN ('role clarity', 'role_clarity', 'role fit', 'role_fit')        THEN 'role_clarity'
  WHEN lower(topic_tag) IN ('salary', 'ctc', 'compensation', 'package')                   THEN 'salary_negotiation'
  WHEN lower(topic_tag) IN ('notice', 'joining', 'availability')                           THEN 'notice_period'
  WHEN lower(topic_tag) IN ('goal', 'goals', 'career goal', 'career_goal', 'aspiration')   THEN 'career_goals'
  WHEN lower(topic_tag) IN ('strength', 'strengths', 'weakness', 'weaknesses',
                             'strength weakness', 'strength_weakness')                     THEN 'strengths_weaknesses'
  WHEN lower(topic_tag) IN ('behaviour', 'behavior', 'situational')                        THEN 'behavioral'
  WHEN lower(topic_tag) IN ('work ethic', 'work_ethic', 'work style', 'work_style')        THEN 'work_style'
  WHEN lower(topic_tag) IN ('company research', 'company_research', 'company knowledge')   THEN 'company_research'
  WHEN lower(topic_tag) IN ('intro', 'introduction', 'about you', 'self intro')            THEN 'motivation'

  -- Technical L1 tags
  WHEN lower(topic_tag) IN ('basic', 'basics', 'fundamental', 'core concepts')             THEN 'fundamentals'
  WHEN lower(topic_tag) IN ('dsa', 'data structure', 'data structures')                    THEN 'data_structures'
  WHEN lower(topic_tag) IN ('algo', 'algorithm')                                            THEN 'algorithms'
  WHEN lower(topic_tag) IN ('db', 'database', 'sql', 'nosql')                              THEN 'databases'
  WHEN lower(topic_tag) IN ('network', 'http', 'tcp', 'protocols')                         THEN 'networking'
  WHEN lower(topic_tag) IN ('code quality', 'clean code', 'best practices')                THEN 'code_quality'
  WHEN lower(topic_tag) IN ('debug', 'troubleshoot', 'troubleshooting')                    THEN 'debugging'
  WHEN lower(topic_tag) IN ('language', 'syntax', 'oop', 'oops', 'concepts')               THEN 'language_concepts'
  WHEN lower(topic_tag) IN ('problem', 'problem solving', 'logical', 'logic')              THEN 'problem_solving'

  -- Technical L2 tags
  WHEN lower(topic_tag) IN ('system design', 'system_design')                              THEN 'system_design'
  WHEN lower(topic_tag) IN ('architect', 'design', 'design pattern', 'design patterns')    THEN 'architecture'
  WHEN lower(topic_tag) IN ('scale', 'scaling', 'load', 'capacity')                        THEN 'scalability'
  WHEN lower(topic_tag) IN ('distributed', 'microservice', 'microservices')                THEN 'distributed_systems'
  WHEN lower(topic_tag) IN ('perf', 'performance', 'optimization', 'latency')              THEN 'performance'
  WHEN lower(topic_tag) IN ('secure', 'security', 'auth', 'authentication')                THEN 'security'
  WHEN lower(topic_tag) IN ('trade off', 'tradeoff', 'trade_off', 'trade-off')             THEN 'trade_offs'
  WHEN lower(topic_tag) IN ('data model', 'schema', 'modelling', 'modeling')               THEN 'data_modeling'
  WHEN lower(topic_tag) IN ('technical', 'deep dive', 'in depth')                          THEN 'technical_depth'

  -- Managerial tags
  WHEN lower(topic_tag) IN ('lead', 'leading', 'leader')                                   THEN 'leadership'
  WHEN lower(topic_tag) IN ('team', 'team lead', 'people management')                      THEN 'team_management'
  WHEN lower(topic_tag) IN ('conflict', 'dispute', 'disagreement')                         THEN 'conflict_resolution'
  WHEN lower(topic_tag) IN ('stakeholder', 'communication', 'stakeholders')                THEN 'stakeholder_management'
  WHEN lower(topic_tag) IN ('decision', 'judgment', 'judgement')                           THEN 'decision_making'
  WHEN lower(topic_tag) IN ('delivery', 'execution', 'project', 'project management')      THEN 'project_delivery'
  WHEN lower(topic_tag) IN ('mentor', 'coaching', 'grooming')                              THEN 'mentoring'
  WHEN lower(topic_tag) IN ('strategic', 'vision', 'roadmap', 'planning')                  THEN 'strategy'
  WHEN lower(topic_tag) IN ('ownership', 'accountability', 'responsibility')               THEN 'ownership'
  WHEN lower(topic_tag) IN ('cross functional', 'cross_functional', 'collaboration')       THEN 'cross_functional'

  ELSE topic_tag  -- leave unchanged if already canonical or no match found
END
WHERE topic_tag NOT IN (
  -- tech_l1
  'fundamentals','data_structures','algorithms','databases','networking',
  'code_quality','debugging','language_concepts','problem_solving','system_basics',
  -- tech_l2
  'system_design','architecture','scalability','distributed_systems','performance',
  'security','trade_offs','data_modeling','technical_depth',
  -- managerial
  'leadership','team_management','conflict_resolution','stakeholder_management',
  'decision_making','project_delivery','mentoring','strategy','ownership','cross_functional',
  -- hr
  'motivation','culture_fit','career_goals','salary_negotiation','notice_period',
  'work_style','company_research','role_clarity','strengths_weaknesses','behavioral'
);

-- Step 2: delete any rows whose tag still doesn't match the canonical list after the remap.
-- These are truly unrecognisable tags — removing them is safe since they'll be
-- re-populated correctly the next time the user completes a session.
DELETE FROM public.weak_areas
WHERE topic_tag NOT IN (
  'fundamentals','data_structures','algorithms','databases','networking',
  'code_quality','debugging','language_concepts','problem_solving','system_basics',
  'system_design','architecture','scalability','distributed_systems','performance',
  'security','trade_offs','data_modeling','technical_depth',
  'leadership','team_management','conflict_resolution','stakeholder_management',
  'decision_making','project_delivery','mentoring','strategy','ownership','cross_functional',
  'motivation','culture_fit','career_goals','salary_negotiation','notice_period',
  'work_style','company_research','role_clarity','strengths_weaknesses','behavioral'
);
