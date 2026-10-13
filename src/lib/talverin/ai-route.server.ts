const NextResponse = { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) }

const NEBIUS_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions'
const NEBIUS_MODEL = 'nvidia/Nemotron-3_5-Lightning'

type GoalInput = {
  title: string
  category?: string
  description?: string
  estimatedHours?: number
  date: string
  priority: string
}

export type CustomRoutineBlock = {
  id: string
  start: string
  end: string
  title: string
  category?: string
}

function hhmmToMins(hhmm: string): number {
  const clean = (hhmm || '00:00').trim()
  const parts = clean.split(':')
  const h = Math.max(0, Math.min(23, Number(parts[0]) || 0))
  const m = Math.max(0, Math.min(59, Number(parts[1]) || 0))
  return h * 60 + m
}

function minsToHhmm(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMins)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function callNebiusJson(system: string, user: string) {
  const key = (process.env.NEBIUS_API_KEY || '').trim()
  if (!key) {
    throw new Error('NEBIUS_API_KEY is not configured in environment')
  }
  const response = await fetch(NEBIUS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: NEBIUS_MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) {
    throw new Error(`Nebius request failed (${response.status})`)
  }
  const data = await response.json()
  const raw = String(data.choices?.[0]?.message?.content || '').trim()
  if (!raw) throw new Error('Nebius returned empty content')
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

async function callTavilySearch(query: string) {
  const key = (process.env.TAVILY_API_KEY || '').trim()
  if (!key) return { answer: '', results: [] }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: query.slice(0, 360),
        search_depth: 'basic',
        include_answer: true,
        max_results: 4,
      }),
    })
    if (!response.ok) return { answer: '', results: [] }
    return await response.json()
  } catch {
    return { answer: '', results: [] }
  }
}

function computeDaysRemaining(dateStr: string): number {
  const parts = (dateStr || '').slice(0, 10).split('-')
  if (parts.length !== 3) return 10
  const target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000)
  return Math.max(1, diff)
}

/**
 * Dynamically finds open deep-work slots around the user's custom routine blocks
 * (e.g., Badminton 07:00-10:00, Sleep 13:00-14:30) and work start preferences
 * (e.g., Morning work starts at 11:00, Afternoon work resumes at 16:00).
 */
function computeOpenDeepWorkSlots(params: {
  wakeTime: string
  sleepTime: string
  morningWorkStart: string
  afternoonWorkStart: string
  routineBlocks: CustomRoutineBlock[]
  dailyWorkMinutes: number
}): Array<{ start: string; end: string; duration: number }> {
  const {
    wakeTime = '07:00',
    sleepTime = '23:00',
    morningWorkStart = '11:00',
    afternoonWorkStart = '16:00',
    routineBlocks,
    dailyWorkMinutes = 360,
  } = params

  const wakeMins = hhmmToMins(wakeTime)
  const sleepMins = Math.max(wakeMins + 180, hhmmToMins(sleepTime))
  const morningStartMins = Math.max(wakeMins, hhmmToMins(morningWorkStart || wakeTime))
  const afternoonResumeMins = hhmmToMins(afternoonWorkStart || '16:00')

  // Build minute-by-minute availability map across [0, 1440)
  const blocked = new Uint8Array(1440)

  // Block before morningWorkStart and after sleepTime
  for (let m = 0; m < morningStartMins; m++) blocked[m] = 1
  for (let m = sleepMins; m < 1440; m++) blocked[m] = 1

  // Block every custom routine interval
  for (const rb of routineBlocks) {
    const s = hhmmToMins(rb.start)
    const e = hhmmToMins(rb.end)
    for (let m = Math.max(0, s); m < Math.min(1440, e); m++) {
      blocked[m] = 1
    }
  }

  // If the user specified an afternoon sleep/break around 13:00 and an afternoonWorkStart (e.g. 16:00),
  // keep the transition window before afternoonWorkStart free for post-nap recharge/lunch
  const hasMiddaySleepOrBreak = routineBlocks.some((rb) => {
    const s = hhmmToMins(rb.start)
    return s >= 12 * 60 && s <= 15 * 60
  })
  if (hasMiddaySleepOrBreak && afternoonResumeMins > 13 * 60) {
    const earliestMiddayBlock = Math.min(
      ...routineBlocks
        .map((rb) => hhmmToMins(rb.start))
        .filter((s) => s >= 12 * 60 && s <= 15 * 60),
    )
    if (Number.isFinite(earliestMiddayBlock)) {
      for (let m = earliestMiddayBlock; m < Math.min(1440, afternoonResumeMins); m++) {
        blocked[m] = 1
      }
    }
  }

  // Extract contiguous free windows and slice into 90-min (or 60-120m) deep-work blocks
  const slots: Array<{ start: string; end: string; duration: number }> = []
  let neededMins = Math.max(90, dailyWorkMinutes)
  let cursor = morningStartMins

  while (cursor < sleepMins && neededMins > 0) {
    if (blocked[cursor]) {
      cursor++
      continue
    }
    let windowEnd = cursor
    while (windowEnd < sleepMins && !blocked[windowEnd]) {
      windowEnd++
    }
    const windowLen = windowEnd - cursor
    if (windowLen >= 60) {
      let pos = cursor
      while (pos + 60 <= windowEnd && neededMins > 0) {
        const remainingInWindow = windowEnd - pos
        let blockDur = 90
        if (remainingInWindow >= 90 && neededMins >= 90) {
          blockDur = 90
        } else if (remainingInWindow >= 60) {
          blockDur = Math.min(remainingInWindow, Math.max(60, neededMins))
          // Round to nearest 15 mins
          blockDur = Math.floor(blockDur / 15) * 15
        }
        slots.push({
          start: minsToHhmm(pos),
          end: minsToHhmm(pos + blockDur),
          duration: blockDur,
        })
        neededMins -= blockDur
        pos += blockDur
      }
    }
    cursor = windowEnd
  }

  return slots
}

function buildGuaranteedFullDaySchedule(params: {
  wakeTime: string
  sleepTime: string
  dailyWorkMinutes: number
  morningWorkStart: string
  afternoonWorkStart: string
  customRoutineBlocks?: CustomRoutineBlock[]
  goalAnalyses: Array<{
    title: string
    deadline: string
    priority: string
    modules: string[]
  }>
}) {
  const {
    wakeTime = '07:00',
    sleepTime = '23:00',
    dailyWorkMinutes = 360,
    morningWorkStart = '11:00',
    afternoonWorkStart = '16:00',
    customRoutineBlocks,
    goalAnalyses,
  } = params

  const defaultRoutineBlocks: CustomRoutineBlock[] =
    Array.isArray(customRoutineBlocks) && customRoutineBlocks.length > 0
      ? customRoutineBlocks
      : [
          {
            id: 'routine-badminton',
            start: '07:00',
            end: '10:00',
            title: 'Play Badminton & Morning Sports Session',
            category: 'sport',
          },
          {
            id: 'routine-breakfast',
            start: '10:00',
            end: '11:00',
            title: 'Post-Badminton Shower, Breakfast & Prep',
            category: 'routine',
          },
          {
            id: 'routine-nap',
            start: '13:00',
            end: '14:30',
            title: 'Afternoon Sleep & Recovery Nap',
            category: 'sleep',
          },
          {
            id: 'routine-lunch',
            start: '14:30',
            end: '16:00',
            title: 'Midday Meal, Recharge & Pre-Work Reset',
            category: 'meal',
          },
          {
            id: 'routine-dinner',
            start: '20:30',
            end: '21:30',
            title: 'Dinner, Family Time & Digital Unplug',
            category: 'meal',
          },
          {
            id: 'routine-night',
            start: '21:30',
            end: sleepTime,
            title: 'Next-Day Assistant Review & Sleep Prep',
            category: 'routine',
          },
        ]

  const activeSlots = computeOpenDeepWorkSlots({
    wakeTime,
    sleepTime,
    morningWorkStart,
    afternoonWorkStart,
    routineBlocks: defaultRoutineBlocks,
    dailyWorkMinutes,
  })

  // Weight task allotment by priority and deadline urgency so High-priority or near-deadline goals get proportional daily blocks
  const sortedGoals = [...goalAnalyses].sort((a, b) => {
    const prioWeight = (p: string) => (p === 'High' ? 3 : p === 'Medium' ? 2 : 1)
    const diffPrio = prioWeight(b.priority) - prioWeight(a.priority)
    if (diffPrio !== 0) return diffPrio
    return a.deadline.localeCompare(b.deadline)
  })

  const allModules: Array<{ goalTitle: string; deadline: string; moduleTitle: string }> = []
  const maxLen = Math.max(...sortedGoals.map((g) => g.modules.length), 1)
  for (let mIdx = 0; mIdx < maxLen; mIdx++) {
    for (const g of sortedGoals) {
      const mod = g.modules[mIdx % g.modules.length] || `Core Execution: ${g.title}`
      allModules.push({
        goalTitle: g.title,
        deadline: g.deadline,
        moduleTitle: mod,
      })
      if (g.priority === 'High' && sortedGoals.length > 1) {
        const nextMod = g.modules[(mIdx + 1) % g.modules.length] || mod
        allModules.push({
          goalTitle: g.title,
          deadline: g.deadline,
          moduleTitle: nextMod,
        })
      }
    }
  }

  const fullDaySchedule: Array<{
    date: string
    totalGoalMinutes: number
    items: Array<{
      id: string
      start: string
      end: string
      durationMinutes: number
      title: string
      type: 'routine' | 'deep-work'
      goal?: string
      deadline?: string
      status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'MISSED'
    }>
  }> = []

  const roadmap: Array<{ date: string; focus: string; minutes: number }> = []
  let cursor = 0

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    const dateStr = d.toISOString().slice(0, 10)

    const items: Array<{
      id: string
      start: string
      end: string
      durationMinutes: number
      title: string
      type: 'routine' | 'deep-work'
      goal?: string
      deadline?: string
      status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'MISSED'
    }> = defaultRoutineBlocks.map((rb, idx) => ({
      id: `${dateStr}-routine-${idx}`,
      start: rb.start,
      end: rb.end,
      durationMinutes: Math.max(15, hhmmToMins(rb.end) - hhmmToMins(rb.start)),
      title: rb.title,
      type: 'routine' as const,
      status: 'PLANNED' as const,
    }))

    let dayGoalMins = 0
    const focusTitles: string[] = []
    activeSlots.forEach((slot, sIdx) => {
      const entry = allModules[cursor % Math.max(1, allModules.length)] || {
        goalTitle: 'Personal Goal',
        deadline: dateStr,
        moduleTitle: 'Focused Deep-Work Module',
      }
      cursor++
      dayGoalMins += slot.duration
      if (!focusTitles.includes(entry.goalTitle)) focusTitles.push(entry.goalTitle)
      items.push({
        id: `${dateStr}-goal-${sIdx}`,
        start: slot.start,
        end: slot.end,
        durationMinutes: slot.duration,
        title: entry.moduleTitle,
        type: 'deep-work',
        goal: entry.goalTitle,
        deadline: entry.deadline,
        status: 'PLANNED',
      })
    })

    items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    fullDaySchedule.push({
      date: dateStr,
      totalGoalMinutes: dayGoalMins,
      items,
    })
    roadmap.push({
      date: dateStr,
      focus: focusTitles.join(' • ') || 'Deep Work & Routine',
      minutes: dayGoalMins,
    })
  }

  return { fullDaySchedule, roadmap }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const action = String(body.action || '')

    if (action === 'personalize_role') {
      const name = String(body.name || 'Friend').trim() || 'Friend'
      const occupation = String(body.occupation || 'University / College Student')
      const dailyHoursLabel = String(body.dailyHoursLabel || '5–6 hours / day')

      const data = await callNebiusJson(
        'You are Talverin, a perceptive Personal AI Assistant powered by NVIDIA Nemotron. Return valid JSON only. Never suggest hackathons or generic NVIDIA goals unless explicitly asked. Tailor strictly to the exact occupation.',
        `Create a personalized assistant profile for ${name}, occupation: "${occupation}", target daily goal work: "${dailyHoursLabel}". Return JSON of shape: {"greeting": string, "personalizationSummary": string, "focusCategories": string[], "suggestedGoals": Array<{"title": string, "category": string, "estimatedHours": number, "description": string}>} with 8 concrete, role-tailored goals.`,
      )
      return NextResponse.json({
        ...data,
        aiSource: 'NVIDIA Nemotron-3.5-Lightning (Live)',
      })
    }

    if (action === 'suggest_goals') {
      const query = String(body.query || '').trim()
      const occupation = String(body.occupation || 'University / College Student')
      const data = await callNebiusJson(
        'Return valid JSON only. Turn the user partial goal query into 5 specific, realistic, actionable goals with concrete syllabus/project scope.',
        `Occupation: "${occupation}". User typed partial goal: "${query}". Return {"goals": Array<{"title": string, "category": string, "estimatedHours": number, "description": string}>}.`,
      )
      return NextResponse.json(data)
    }

    if (action === 'parse_routine') {
      const text = String(body.text || '').trim()
      try {
        const parsed = await callNebiusJson(
          'You convert a user natural-language daily routine description into 24-hour HH:MM blocked routine slots and work start times. Return valid JSON only.',
          `User routine description: "${text}". Return JSON of shape: {"morningWorkStart": "HH:MM", "afternoonWorkStart": "HH:MM", "routineBlocks": Array<{"id": string, "start": "HH:MM", "end": "HH:MM", "title": string, "category": "sport"|"sleep"|"meal"|"routine"}>}. Ensure any gap between morning activity and morningWorkStart is covered by a prep/breakfast block, and any gap between afternoon sleep and afternoonWorkStart is covered by a recharge/lunch block.`,
        )
        return NextResponse.json(parsed)
      } catch {
        return NextResponse.json({
          morningWorkStart: '11:00',
          afternoonWorkStart: '16:00',
          routineBlocks: [
            {
              id: 'r-badminton',
              start: '07:00',
              end: '10:00',
              title: 'Play Badminton & Morning Sports Session',
              category: 'sport',
            },
            {
              id: 'r-prep',
              start: '10:00',
              end: '11:00',
              title: 'Post-Badminton Shower, Breakfast & Prep',
              category: 'routine',
            },
            {
              id: 'r-sleep',
              start: '13:00',
              end: '14:30',
              title: 'Afternoon Sleep & Recovery Nap',
              category: 'sleep',
            },
            {
              id: 'r-lunch',
              start: '14:30',
              end: '16:00',
              title: 'Midday Meal, Recharge & Pre-Work Reset',
              category: 'meal',
            },
            {
              id: 'r-dinner',
              start: '20:30',
              end: '21:30',
              title: 'Dinner, Family Time & Digital Unplug',
              category: 'meal',
            },
          ],
        })
      }
    }

    if (action === 'research_and_build_plan') {
      const rawGoals = Array.isArray(body.goals) ? (body.goals as GoalInput[]) : []
      const dailyWorkMinutes = Number(body.dailyWorkMinutes || 360)
      const wakeTime = String(body.wakeTime || '07:00')
      const sleepTime = String(body.sleepTime || '23:00')
      const morningWorkStart = String(body.morningWorkStart || '11:00')
      const afternoonWorkStart = String(body.afternoonWorkStart || '16:00')
      const customRoutineBlocks = Array.isArray(body.customRoutineBlocks)
        ? (body.customRoutineBlocks as CustomRoutineBlock[])
        : undefined

      // 1. Research each goal live with Tavily Search API
      const researchedGoals = await Promise.all(
        rawGoals.map(async (g) => {
          const tRes = await callTavilySearch(
            `${g.title} ${g.description || ''} syllabus modules curriculum step by step guide`,
          )
          const sources = Array.isArray(tRes.results)
            ? tRes.results.slice(0, 4).map((r: Record<string, unknown>) => ({
                title: String(r.title || g.title).slice(0, 120),
                url: String(r.url || ''),
                snippet: String(r.content || '').slice(0, 260),
              }))
            : []
          const daysRemaining = computeDaysRemaining(g.date)
          const estHours = Number(g.estimatedHours || 12)
          const reqDaily = Math.max(45, Math.round((estHours * 60) / daysRemaining))
          return {
            goal: g,
            daysRemaining,
            requiredDailyMinutes: reqDaily,
            tavilyAnswer: String(tRes.answer || ''),
            sources,
          }
        }),
      )

      // 2. Ask NVIDIA Nemotron to synthesize syllabus-specific modules + personalized task allotment overview
      const userName = String(body.name || 'Friend').trim() || 'Friend'
      const userOccupation = String(body.occupation || 'University / College Student')
      let aiModulesByGoal: Record<string, { summary: string; modules: string[] }> = {}
      let personalizationOverview = `Tailored for ${userName} (${userOccupation}): ${(dailyWorkMinutes / 60).toFixed(1)} hrs/day (${dailyWorkMinutes} mins) allotted around your custom schedule (starting work at ${morningWorkStart}, resuming at ${afternoonWorkStart}).`

      try {
        const nemotronPlan = await callNebiusJson(
          'You decompose goals researched with Tavily into 5 concise, syllabus-accurate modules per goal (each module title must be 4 to 8 words max, never include parenthetical explanations like "(based on snippet...)"). Write a concise 1-sentence personalizationOverview. Return valid JSON only.',
          JSON.stringify({
            user: {
              name: userName,
              occupation: userOccupation,
              dailyWorkMinutes,
              wakeTime,
              sleepTime,
              morningWorkStart,
              afternoonWorkStart,
              customRoutineBlocks,
            },
            goals: researchedGoals.map((rg) => ({
              title: rg.goal.title,
              deadline: rg.goal.date,
              priority: rg.goal.priority,
              daysRemaining: rg.daysRemaining,
              tavilySummary: rg.tavilyAnswer,
              webSnippets: rg.sources.map((s) => `${s.title}: ${s.snippet}`),
            })),
            schema: {
              personalizationOverview:
                '1 concise sentence addressed to the user by name explaining their daily schedule rhythm',
              analyses: [
                {
                  title: 'exact goal title',
                  summary: '2-sentence curriculum & strategy synthesis grounded in Tavily research',
                  modules: [
                    'Module 1: Short 5-word topic title',
                    'Module 2: Short 5-word topic title',
                    'Module 3: Short 5-word topic title',
                    'Module 4: Short 5-word topic title',
                    'Module 5: Short 5-word topic title',
                  ],
                },
              ],
            },
          }),
        )
        if (nemotronPlan?.personalizationOverview) {
          personalizationOverview = String(nemotronPlan.personalizationOverview)
        }
        if (Array.isArray(nemotronPlan?.analyses)) {
          for (const item of nemotronPlan.analyses) {
            if (item?.title) {
              aiModulesByGoal[String(item.title).toLowerCase()] = {
                summary: String(item.summary || ''),
                modules: Array.isArray(item.modules) ? item.modules.map(String) : [],
              }
            }
          }
        }
      } catch {
        // Fallback to Tavily-derived modules if LLM times out
      }

      const goalAnalyses = researchedGoals.map((rg) => {
        const key = rg.goal.title.toLowerCase()
        const fromAi = aiModulesByGoal[key]
        const fallbackModules =
          rg.sources.length >= 3
            ? rg.sources.map((s, idx) => `Module ${idx + 1}: ${s.title}`)
            : [
                `Module 1: Core Foundations & Architecture — ${rg.goal.title}`,
                `Module 2: Practical Workflows & Guided Labs — ${rg.goal.title}`,
                `Module 3: Applied Implementation & Problem Solving — ${rg.goal.title}`,
                `Module 4: Advanced Optimization & Review — ${rg.goal.title}`,
                `Module 5: Final Capstone Assessment & Completion — ${rg.goal.title}`,
              ]
        return {
          title: rg.goal.title,
          deadline: rg.goal.date,
          priority: rg.goal.priority || 'High',
          summary:
            fromAi?.summary ||
            rg.tavilyAnswer ||
            `Tavily indexed ${rg.sources.length} curriculum sources for "${rg.goal.title}". Allotted into focused deep-work sessions before ${rg.goal.date}.`,
          daysRemaining: rg.daysRemaining,
          requiredDailyMinutes: rg.requiredDailyMinutes,
          sources:
            rg.sources.length > 0
              ? rg.sources
              : [
                  {
                    title: `${rg.goal.title} — Official Curriculum & Guide`,
                    url: `https://www.google.com/search?q=${encodeURIComponent(rg.goal.title)}`,
                    snippet: `Structured learning path and practice milestones for ${rg.goal.title}.`,
                  },
                ],
          modules:
            fromAi?.modules && fromAi.modules.length >= 3 ? fromAi.modules : fallbackModules,
        }
      })

      const { fullDaySchedule, roadmap } = buildGuaranteedFullDaySchedule({
        wakeTime,
        sleepTime,
        dailyWorkMinutes,
        morningWorkStart,
        afternoonWorkStart,
        customRoutineBlocks,
        goalAnalyses,
      })

      return NextResponse.json({
        aiSource: 'NVIDIA Nemotron-3.5-Lightning + Tavily Search (Live)',
        personalizationOverview,
        goalAnalyses,
        fullDaySchedule,
        roadmap,
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
