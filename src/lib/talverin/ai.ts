import type { DaySchedule } from "./types";

export type AiGoal = { title: string; category: string; estimatedHours: number; description: string };
export type GoalAnalysis = {
  title: string; deadline: string; priority?: string; summary: string; daysRemaining: number;
  requiredDailyMinutes: number; sources: { title: string; url: string; snippet: string }[]; modules: string[];
};
export type Plan = {
  personalizationOverview?: string;
  goalAnalyses: GoalAnalysis[];
  fullDaySchedule: DaySchedule[];
  roadmap: { date: string; focus: string; minutes: number }[];
};

/** Single endpoint POST /api/ai. Throws Error(message) on any failure; callers must catch. */
export async function callAi<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const e = (await res.json()) as { error?: string }; if (e?.error) msg = e.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
