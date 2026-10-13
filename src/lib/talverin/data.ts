import type { Capacity, DaySchedule, Goal, RoutineBlock, ScheduleItem } from "./types";

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (n: number, base = new Date()) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};
export const uid = () => Math.random().toString(36).slice(2, 9);

export const ROLES = [
  { id: "uni", title: "University Student", tag: "Academic", subtitle: "Lectures, labs and exam prep", icon: "GraduationCap" },
  { id: "eng", title: "Software & AI Engineer", tag: "Technical", subtitle: "Ship code, learn new stacks", icon: "Cpu" },
  { id: "biz", title: "Business/Finance", tag: "Professional", subtitle: "Certifications and analysis skills", icon: "Briefcase" },
  { id: "founder", title: "Startup Founder", tag: "Builder", subtitle: "Learn fast between everything else", icon: "Rocket" },
  { id: "exam", title: "Exam Aspirant", tag: "Competitive", subtitle: "Structured syllabus, strict deadlines", icon: "Target" },
  { id: "design", title: "Designer", tag: "Creative", subtitle: "Craft, tools and portfolio work", icon: "PenTool" },
] as const;

export const CAPACITIES: Capacity[] = [
  { id: "steady", label: "Steady", hours: 2, pattern: "2 × 60m" },
  { id: "balanced", label: "Balanced", hours: 4, pattern: "4 × 60m" },
  { id: "optimal", label: "Optimal", hours: 6, pattern: "4 × 90m" },
  { id: "immersion", label: "Immersion", hours: 7.5, pattern: "5 × 90m" },
];

export const SEED_ROUTINE: RoutineBlock[] = [
  { id: "r1", start: "07:00", end: "10:00", title: "Badminton" },
  { id: "r2", start: "10:00", end: "11:00", title: "Breakfast" },
  { id: "r3", start: "13:00", end: "14:30", title: "Nap" },
  { id: "r4", start: "14:30", end: "16:00", title: "Lunch" },
  { id: "r5", start: "20:30", end: "21:30", title: "Dinner" },
  { id: "r6", start: "21:30", end: "23:00", title: "Review" },
];

export const GOAL_LIBRARY: Omit<Goal, "date" | "priority">[] = [
  { id: "g-python", title: "Python course", category: "Programming", description: "Finish the full Python fundamentals course with exercises.", estimatedHours: 14 },
  { id: "g-gai", title: "Google AI Essentials", category: "AI", description: "Complete all modules and earn the certificate.", estimatedHours: 12 },
  { id: "g-sql", title: "SQL for Data Analysis", category: "Data", description: "Joins, window functions and reporting queries.", estimatedHours: 10 },
  { id: "g-dsa", title: "Data Structures & Algorithms", category: "Programming", description: "Core patterns with 40 practice problems.", estimatedHours: 20 },
  { id: "g-figma", title: "Figma Auto Layout", category: "Design", description: "Master components, variants and auto layout.", estimatedHours: 6 },
  { id: "g-fin", title: "Financial Modeling", category: "Finance", description: "Build a three-statement model from scratch.", estimatedHours: 16 },
];

export const AI_SUGGESTIONS = ["Prompt Engineering Basics", "Machine Learning Crash Course", "Public Speaking", "Statistics Refresher"];

export const SEED_GOALS: Goal[] = [
  { ...GOAL_LIBRARY[0], date: isoDate(addDays(14)), priority: "High" },
  { ...GOAL_LIBRARY[1], date: isoDate(addDays(15)), priority: "Medium" },
];

const DEEP_SLOTS: [string, string][] = [
  ["11:00", "13:00"],
  ["16:00", "18:00"],
  ["18:30", "20:00"],
];

export function buildWeek(goals: Goal[], routine: RoutineBlock[], capacityHours = 4): DaySchedule[] {
  const days: DaySchedule[] = [];
  const budget = capacityHours * 60;
  for (let d = 0; d < 7; d++) {
    const date = isoDate(addDays(d));
    const items: ScheduleItem[] = routine.map((r) => ({
      id: uid(), start: r.start, end: r.end, durationMinutes: toMin(r.end) - toMin(r.start),
      title: r.title, type: "routine", status: "PLANNED",
    }));
    let used = 0;
    DEEP_SLOTS.forEach(([s, e], i) => {
      if (!goals.length) return;
      const dur = toMin(e) - toMin(s);
      if (used + dur > budget + 30) return;
      const g = goals[(i + d) % goals.length]!;
      used += dur;
      items.push({
        id: uid(), start: s, end: e, durationMinutes: dur,
        title: `${g.title} — Session ${d * 2 + i + 1}`, type: "deep-work", goal: g.title, deadline: g.date, status: "PLANNED",
      });
    });
    items.sort((a, b) => toMin(a.start) - toMin(b.start));
    days.push({ date, totalGoalMinutes: used, items });
  }
  return days;
}
