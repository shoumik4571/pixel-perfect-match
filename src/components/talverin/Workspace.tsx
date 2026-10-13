import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  AlarmClock, BookOpen, Calendar, CalendarDays, Check, ChevronRight, Clock, Edit3, Home, LayoutGrid, Pause, Play,
  Plus, RefreshCw, Settings2, Shield, Sparkles, Square, Target, Wand2, X,
} from "lucide-react";
import { CAPACITIES, ROLES, addDays, buildWeek, isoDate, toHHMM, toMin, uid } from "@/lib/talverin/data";
import type { DaySchedule, Goal, Profile, RoutineBlock, ScheduleItem } from "@/lib/talverin/types";

const pill = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]";
const dark = `${pill} bg-primary text-primary-foreground`;
const light = `${pill} border border-border bg-card text-ink`;

function AnimatedNumber({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => v.toFixed(decimals) + suffix);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return c.stop;
  }, [value, mv]);
  return <motion.span className="num">{text}</motion.span>;
}

function Ring({ pct, size = 64, stroke = 8, color = "var(--color-lime)" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-track)" strokeWidth={stroke} fill="none" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct / 100)) }}
        transition={{ duration: 1, ease: "easeOut" }} />
    </svg>
  );
}

const fmtH = (m: number) => `${(m / 60).toFixed(1)}h`;
const dayLabel = (iso: string) => new Date(iso + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
const card = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, type: "spring" as const, stiffness: 240, damping: 24 } });

export function Workspace({ profile, routine, goals, onEditGoals }: { profile: Profile; routine: RoutineBlock[]; goals: Goal[]; onEditGoals: () => void }) {
  const capHours = CAPACITIES.find((c) => c.id === profile.capacity)?.hours ?? 4;
  const [week, setWeek] = useState<DaySchedule[]>(() => buildWeek(goals, routine, capHours));
  const [dayIdx, setDayIdx] = useState(0);
  const [nav, setNav] = useState("Daily Schedule");
  const [editing, setEditing] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; remaining: number; paused: boolean } | null>(null);
  const [alarms, setAlarms] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [refitMsg, setRefitMsg] = useState("");

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!active || active.paused) return;
    const t = setInterval(() => setActive((a) => (a && !a.paused ? { ...a, remaining: Math.max(0, a.remaining - 1) } : a)), 1000);
    return () => clearInterval(t);
  }, [active?.paused, active?.id]);

  const day = week[dayIdx]!;
  const updateItem = (id: string, patch: Partial<ScheduleItem>) =>
    setWeek((w) => w.map((d, i) => (i !== dayIdx ? d : { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)).sort((a, b) => toMin(a.start) - toMin(b.start)) })));
  const removeItem = (id: string) => setWeek((w) => w.map((d, i) => (i !== dayIdx ? d : { ...d, items: d.items.filter((it) => it.id !== id) })));

  const start = (it: ScheduleItem) => {
    if (active) updateItem(active.id, { status: "PLANNED" });
    updateItem(it.id, { status: "IN_PROGRESS" });
    setActive({ id: it.id, remaining: it.durationMinutes * 60, paused: false });
  };
  const done = (id: string) => {
    updateItem(id, { status: "DONE" });
    if (active?.id === id) setActive(null);
  };
  const shift = (it: ScheduleItem, mins: number) => updateItem(it.id, { start: toHHMM(toMin(it.start) + mins), end: toHHMM(toMin(it.end) + mins) });
  const reschedule = (it: ScheduleItem) => {
    if (dayIdx >= 6) return;
    setWeek((w) => w.map((d, i) => {
      if (i === dayIdx) return { ...d, items: d.items.filter((x) => x.id !== it.id), totalGoalMinutes: d.totalGoalMinutes - (it.type === "deep-work" ? it.durationMinutes : 0) };
      if (i === dayIdx + 1) return { ...d, items: [...d.items, { ...it, status: "PLANNED" as const }].sort((a, b) => toMin(a.start) - toMin(b.start)), totalGoalMinutes: d.totalGoalMinutes + (it.type === "deep-work" ? it.durationMinutes : 0) };
      return d;
    }));
  };
  const addSlot = () => {
    const last = day.items.at(-1);
    const s = last ? Math.min(toMin(last.end), 23 * 60) : 9 * 60;
    const g = goals[0];
    const it: ScheduleItem = { id: uid(), start: toHHMM(s), end: toHHMM(s + 60), durationMinutes: 60, title: g ? `${g.title} — Extra session` : "Focus session", type: "deep-work", goal: g?.title, deadline: g?.date, status: "PLANNED" };
    setWeek((w) => w.map((d, i) => (i !== dayIdx ? d : { ...d, items: [...d.items, it], totalGoalMinutes: d.totalGoalMinutes + 60 })));
    setEditing(it.id);
  };
  const refit = () => {
    const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;
    let moved = 0;
    setWeek((w) => w.map((d, i) => {
      if (i !== dayIdx) return d;
      let cursor = Math.ceil(nowMin / 15) * 15;
      return {
        ...d,
        items: d.items.map((it) => {
          if (it.type !== "deep-work" || it.status !== "PLANNED" || dayIdx !== 0) return it;
          if (toMin(it.start) >= nowMin) return it;
          const s = cursor; cursor += it.durationMinutes + 15; moved++;
          return { ...it, start: toHHMM(s), end: toHHMM(s + it.durationMinutes) };
        }).sort((a, b) => toMin(a.start) - toMin(b.start)),
      };
    }));
    setTimeout(() => setRefitMsg(moved ? `Re-fitted ${moved} pending session${moved > 1 ? "s" : ""} after now.` : "Everything already fits — nothing to move."), 0);
  };

  const deep = day.items.filter((i) => i.type === "deep-work");
  const doneDeep = deep.filter((i) => i.status === "DONE");
  const allDeep = week.flatMap((d) => d.items.filter((i) => i.type === "deep-work"));
  const completedPct = deep.length ? Math.round((doneDeep.length / deep.length) * 100) : 0;
  const focusMin = deep.reduce((a, b) => a + b.durationMinutes, 0);
  const doneMin = doneDeep.reduce((a, b) => a + b.durationMinutes, 0);
  const weekBars = week.map((d) => d.items.filter((i) => i.type === "deep-work").reduce((a, b) => a + b.durationMinutes, 0));
  const maxBar = Math.max(...weekBars, 1);
  const peak = weekBars.indexOf(maxBar);
  const totalGoalH = goals.reduce((a, g) => a + g.estimatedHours, 0);
  const plannedH = allDeep.reduce((a, b) => a + b.durationMinutes, 0) / 60;
  const readiness = Math.min(100, Math.round((plannedH / Math.max(1, totalGoalH)) * 100 + completedPct * 0.2));
  const score = Math.round(readiness * 0.6 + completedPct * 0.4);
  const goalSplit = goals.map((g) => ({ g, min: allDeep.filter((i) => i.goal === g.title).reduce((a, b) => a + b.durationMinutes, 0), done: allDeep.filter((i) => i.goal === g.title && i.status === "DONE").reduce((a, b) => a + b.durationMinutes, 0) }));
  const splitTotal = Math.max(1, goalSplit.reduce((a, b) => a + b.min, 0));
  const routineItems = day.items.filter((i) => i.type === "routine");
  const activeItem = active ? week.flatMap((d) => d.items).find((i) => i.id === active.id) : null;
  const roleName = ROLES.find((r) => r.id === profile.role)?.title ?? "Learner";
  const NAV = [
    { label: "Daily Schedule", icon: Calendar },
    { label: "Syllabus & Modules", icon: BookOpen },
    { label: "7-Day Roadmap", icon: CalendarDays },
    { label: "AI Studio", icon: Sparkles },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Dock */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-dock p-5 text-dock-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-lime font-display font-bold text-lime-foreground">T</div>
          <span className="font-display text-lg font-bold">Talverin</span>
        </div>
        <button onClick={onEditGoals} className={`${pill} mt-6 bg-lime text-lime-foreground`}><Plus className="size-4" /> Add/Edit Goals</button>
        <nav className="mt-6 space-y-1">
          {NAV.map((n) => (
            <button key={n.label} onClick={() => setNav(n.label)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${nav === n.label ? "bg-dock-raised text-dock-foreground" : "text-dock-muted hover:text-dock-foreground"}`}>
              <n.icon className="size-4" /> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-dock-muted">Calibration</div>
        <div className="mt-2 space-y-1 text-sm">
          {["Capacity", "Routine blocks", "Deadlines"].map((c) => (
            <button key={c} onClick={onEditGoals} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-dock-muted hover:text-dock-foreground">{c}<ChevronRight className="size-4" /></button>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-3 rounded-2xl bg-dock-raised p-3">
          <div className="grid size-9 place-items-center rounded-full bg-lime font-display font-bold text-lime-foreground">{profile.name[0]?.toUpperCase()}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{profile.name}</div>
            <div className="truncate text-xs text-dock-muted">{roleName}</div>
          </div>
        </div>
      </aside>

      {/* Center */}
      <main className="min-w-0 flex-1 px-4 pb-32 pt-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-meta">Good to see you, {profile.name}</p>
            <h1 className="text-3xl font-bold md:text-4xl">{nav}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="num rounded-full bg-card px-4 py-2 text-sm text-ink shadow-[var(--shadow-card)]"><Clock className="mr-1.5 inline size-4" />{now ? now.toLocaleTimeString("en-GB") : "--:--:--"}</span>
            <button onClick={onEditGoals} className={light}><Settings2 className="size-4" /> Customize Routine</button>
            <button onClick={addSlot} className={dark}><Plus className="size-4" /> Add Slot</button>
          </div>
        </header>

        {/* Stat cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <motion.div {...card(0)} className="card-soft col-span-2 p-5 md:col-span-1">
            <div className="text-xs font-medium text-meta">Today's Focus</div>
            <div className="mt-1 text-2xl font-semibold text-ink"><AnimatedNumber value={focusMin / 60} decimals={1} suffix="h" /></div>
            <div className="mt-3 flex h-10 items-end gap-1">
              {weekBars.map((b, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${(b / maxBar) * 100}%` }} transition={{ delay: i * 0.05 }}
                  className={`flex-1 rounded-sm ${i === dayIdx ? "bg-lime" : "bg-primary"}`} />
              ))}
            </div>
          </motion.div>
          <motion.div {...card(1)} className="card-soft flex flex-col p-5">
            <div className="text-xs font-medium text-meta">Completed</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="relative"><Ring pct={completedPct} size={56} stroke={7} /></div>
              <div className="text-2xl font-semibold text-ink"><AnimatedNumber value={completedPct} suffix="%" /></div>
            </div>
          </motion.div>
          <motion.div {...card(2)} className="card-soft p-5">
            <div className="text-xs font-medium text-meta">Active Goals</div>
            <div className="mt-1 text-3xl font-semibold text-ink"><AnimatedNumber value={goals.length} /></div>
            <div className="num mt-2 text-xs text-meta">{totalGoalH}h total</div>
          </motion.div>
          <motion.div {...card(3)} className="card-soft p-5">
            <div className="text-xs font-medium text-meta">Readiness</div>
            <div className="mt-2 h-2 rounded-full bg-track"><motion.div initial={{ width: 0 }} animate={{ width: `${readiness}%` }} className="h-2 rounded-full bg-primary" /></div>
            <div className="mt-2 text-2xl font-semibold text-ink"><AnimatedNumber value={readiness} suffix="%" /></div>
            <div className="num text-xs text-delta">+{Math.round(plannedH)}h planned</div>
          </motion.div>
          <motion.div {...card(4)} className="card-soft p-5">
            <div className="text-xs font-medium text-meta">Sessions</div>
            <div className="mt-1 text-3xl font-semibold text-ink"><span className="num">{doneDeep.length}</span><span className="num text-lg text-meta">/{deep.length}</span></div>
            <div className="mt-2 text-xs text-meta">deep-work today</div>
          </motion.div>
          <motion.div {...card(5)} className="card-soft p-5">
            <div className="text-xs font-medium text-meta">Routine Blocks</div>
            <div className="mt-1 text-3xl font-semibold text-ink"><AnimatedNumber value={routineItems.length} /></div>
            <div className="mt-2 text-xs text-meta">protected today</div>
          </motion.div>
        </section>

        {/* Charts row */}
        <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <motion.div {...card(6)} className="card-soft p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Weekly Focus</h3>
              <span className="num text-xs text-meta">{fmtH(weekBars.reduce((a, b) => a + b, 0))} this week</span>
            </div>
            <div className="mt-6 flex h-44 items-end gap-3">
              {weekBars.map((b, i) => (
                <button key={i} onClick={() => setDayIdx(i)} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="num text-xs font-semibold text-ink">{fmtH(b)}</span>
                  <div className="relative w-full flex-1 overflow-hidden rounded-xl bg-track">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(b / maxBar) * 100}%` }} transition={{ delay: 0.2 + i * 0.07, type: "spring", stiffness: 120, damping: 18 }}
                      className={`absolute inset-x-0 bottom-0 rounded-xl ${i === peak ? "bg-primary" : "bg-body"} ${i === dayIdx ? "ring-2 ring-lime ring-offset-2 ring-offset-card" : ""}`} />
                  </div>
                  <span className={`text-xs ${i === dayIdx ? "font-semibold text-ink" : "text-meta"}`}>{dayLabel(week[i].date)}</span>
                </button>
              ))}
            </div>
          </motion.div>
          <motion.div {...card(7)} className="card-soft p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Completion Report</h3>
              <button onClick={refit} className={`${dark} py-1.5 text-xs`}><RefreshCw className="size-3.5" /> Re-fit</button>
            </div>
            <div className="mt-4 space-y-2">
              <div className="tile flex items-center justify-between bg-inset px-4 py-3 text-sm"><span>Finished</span><span className="num font-semibold text-ink">{doneDeep.length} · {fmtH(doneMin)}</span></div>
              <div className="tile flex items-center justify-between bg-inset px-4 py-3 text-sm"><span>Remaining</span><span className="num font-semibold text-ink">{deep.length - doneDeep.length} · {fmtH(focusMin - doneMin)}</span></div>
              <div className="tile flex items-center justify-between bg-inset px-4 py-3 text-sm"><span>Performance</span><span className="num font-semibold text-ink">{completedPct}%</span></div>
            </div>
            <AnimatePresence>{refitMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-xs text-delta">{refitMsg}</motion.p>}</AnimatePresence>
          </motion.div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <motion.div {...card(8)} className="card-soft p-6">
            <h3 className="font-semibold">Goal Split</h3>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-track">
              {goalSplit.map((s, i) => (
                <motion.div key={s.g.id} initial={{ width: 0 }} animate={{ width: `${(s.min / splitTotal) * 100}%` }} className={i === 0 ? "bg-primary" : i === 1 ? "bg-lime" : "bg-meta"} />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {goalSplit.map((s, i) => (
                <div key={s.g.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${i === 0 ? "bg-primary" : i === 1 ? "bg-lime" : "bg-meta"}`} />{s.g.title}</span>
                  <span className="num text-ink">{fmtH(s.min)} · {Math.round((s.min / splitTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div {...card(9)} className="card-soft p-6">
            <div className="flex items-center gap-2"><Shield className="size-4 text-ink" /><h3 className="font-semibold">Routine Guard</h3></div>
            <div className="mt-4 space-y-2">
              {routineItems.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span><span className="num text-meta">{r.start}–{r.end}</span> <span className="ml-2 text-ink">{r.title}</span></span>
                  <span className="rounded-full bg-inset px-2.5 py-0.5 text-[11px] font-semibold text-delta">kept</span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Telemetry + timeline */}
        <section className="card-soft mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 rounded-full bg-inset p-1">
              {week.map((d, i) => (
                <button key={d.date} onClick={() => setDayIdx(i)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${i === dayIdx ? "bg-lime text-lime-foreground" : "text-meta hover:text-ink"}`}>
                  {i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(d.date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </button>
              ))}
            </div>
            <div className="num flex gap-4 text-xs text-meta">
              <span>{day.items.length} blocks</span><span>{fmtH(focusMin)} focus</span><span>{alarms.length} alarms</span>
            </div>
          </div>

          <div className="relative mt-6 space-y-3 pl-6">
            <div className="absolute bottom-2 left-2 top-2 w-px bg-border" />
            <AnimatePresence initial={false}>
              {day.items.map((it) => {
                const isDeep = it.type === "deep-work";
                return (
                  <motion.div key={it.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="relative">
                    <span className={`absolute -left-[22px] top-5 size-3 rounded-full border-2 border-card ${it.status === "DONE" ? "bg-delta" : it.status === "IN_PROGRESS" ? "bg-lime" : isDeep ? "bg-primary" : "bg-track"}`} />
                    <div className={`tile p-4 ${isDeep ? "border border-border bg-card" : "bg-inset"}`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="num rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{it.start}–{it.end}</span>
                        {it.goal && <span className="rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-semibold text-lime-foreground">{it.goal}</span>}
                        {!isDeep && <span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-semibold text-meta">Routine</span>}
                        <span className="num text-xs text-meta">{it.durationMinutes}m</span>
                        {it.status !== "PLANNED" && <span className={`text-[11px] font-semibold ${it.status === "DONE" ? "text-delta" : "text-ink"}`}>{it.status.replace("_", " ")}</span>}
                        {alarms.includes(it.id) && <AlarmClock className="size-3.5 text-ink" />}
                      </div>
                      <div className={`mt-2 font-display font-semibold ${it.status === "DONE" ? "text-meta line-through" : "text-ink"}`}>{it.title}</div>
                      {it.deadline && <div className="num mt-0.5 text-xs text-meta">Due {it.deadline}</div>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isDeep && it.status !== "DONE" && (
                          <button onClick={() => start(it)} className={`${dark} px-3 py-1.5 text-xs`}><Play className="size-3.5" />{it.status === "IN_PROGRESS" ? "Restart" : "Start"}</button>
                        )}
                        <button onClick={() => (it.status === "DONE" ? updateItem(it.id, { status: "PLANNED" }) : done(it.id))} className={`${light} px-3 py-1.5 text-xs`}><Check className="size-3.5" />{it.status === "DONE" ? "Undo" : "Done"}</button>
                        <button onClick={() => setEditing(editing === it.id ? null : it.id)} className={`${light} px-3 py-1.5 text-xs`}><Edit3 className="size-3.5" />Edit</button>
                        {dayIdx < 6 && <button onClick={() => reschedule(it)} className={`${light} px-3 py-1.5 text-xs`}><CalendarDays className="size-3.5" />Reschedule</button>}
                        <button onClick={() => setAlarms((a) => (a.includes(it.id) ? a.filter((x) => x !== it.id) : [...a, it.id]))} className={`${light} px-3 py-1.5 text-xs ${alarms.includes(it.id) ? "bg-lime" : ""}`}><AlarmClock className="size-3.5" />Alarm</button>
                        <button onClick={() => removeItem(it.id)} className={`${light} px-3 py-1.5 text-xs text-meta`} aria-label="Remove block"><X className="size-3.5" /></button>
                      </div>
                      <AnimatePresence>
                        {editing === it.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                              <input value={it.title} onChange={(e) => updateItem(it.id, { title: e.target.value })} className="min-w-48 flex-1 rounded-[14px] border border-border bg-inset px-3 py-1.5 text-sm text-ink" />
                              <input type="time" value={it.start} onChange={(e) => updateItem(it.id, { start: e.target.value, end: toHHMM(toMin(e.target.value) + it.durationMinutes) })} className="num rounded-[14px] border border-border bg-inset px-2 py-1.5 text-sm text-ink" />
                              <input type="time" value={it.end} onChange={(e) => updateItem(it.id, { end: e.target.value, durationMinutes: Math.max(5, toMin(e.target.value) - toMin(it.start)) })} className="num rounded-[14px] border border-border bg-inset px-2 py-1.5 text-sm text-ink" />
                              {[-30, -15, 15, 30, 60].map((m) => (
                                <button key={m} onClick={() => shift(it, m)} className="num rounded-full bg-inset px-2.5 py-1 text-xs font-semibold text-ink hover:bg-lime">{m > 0 ? "+" : ""}{m}m</button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Inspector */}
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto p-6 pl-0 2xl:block">
        <div className="card-soft p-6 text-center">
          <div className="text-xs font-medium text-meta">Study Score</div>
          <div className="relative mx-auto mt-3 grid size-32 place-items-center">
            <div className="absolute inset-0"><Ring pct={score} size={128} stroke={12} /></div>
            <div className="text-3xl font-semibold text-ink"><AnimatedNumber value={score} /></div>
          </div>
          <p className="mt-3 text-sm text-meta">Based on readiness and today's completion.</p>
        </div>
        <div className="mt-4 space-y-3">
          {goalSplit.map((s) => {
            const pct = Math.round((s.done / 60 / s.g.estimatedHours) * 100);
            return (
              <div key={s.g.id} className="card-soft p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-inset px-2.5 py-0.5 text-[11px] font-semibold text-meta">{s.g.priority}</span>
                  <span className="num text-xs text-meta">Due {s.g.date}</span>
                </div>
                <div className="mt-2 font-display font-semibold text-ink">{s.g.title}</div>
                <div className="mt-3 h-2 rounded-full bg-track"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, pct)}%` }} className="h-2 rounded-full bg-primary" /></div>
                <div className="num mt-1.5 flex justify-between text-xs text-meta"><span>{fmtH(s.done)} / {s.g.estimatedHours}h</span><span>{pct}%</span></div>
              </div>
            );
          })}
        </div>
        <div className="card-soft mt-4 p-5">
          <h3 className="text-sm font-semibold">Daily Rhythm</h3>
          <div className="relative mt-4 h-6 rounded-full bg-track">
            {day.items.map((it) => (
              <div key={it.id} className={`absolute top-0 h-6 rounded-full ${it.type === "deep-work" ? "bg-primary" : "bg-meta/40"}`}
                style={{ left: `${(toMin(it.start) / 1440) * 100}%`, width: `${(it.durationMinutes / 1440) * 100}%` }} />
            ))}
          </div>
          <div className="num mt-2 flex justify-between text-[10px] text-meta"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        </div>
        <p className="mt-4 text-center text-xs text-meta">Talverin · {isoDate(addDays(0))}</p>
      </aside>

      {/* Focus player */}
      <AnimatePresence>
        {active && activeItem && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full bg-dock py-2.5 pl-5 pr-2.5 text-dock-foreground shadow-[var(--shadow-card)] lg:bottom-6">
            <div className="min-w-0">
              <div className="max-w-52 truncate text-xs text-dock-muted">{activeItem.title}</div>
              <div className="num text-xl font-semibold">{String(Math.floor(active.remaining / 60)).padStart(2, "0")}:{String(active.remaining % 60).padStart(2, "0")}</div>
            </div>
            <button onClick={() => setActive({ ...active, paused: !active.paused })} className="grid size-10 place-items-center rounded-full bg-dock-raised" aria-label="Pause">{active.paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
            <button onClick={() => done(active.id)} className="grid size-10 place-items-center rounded-full bg-lime text-lime-foreground" aria-label="Finish"><Check className="size-4" /></button>
            <button onClick={() => { updateItem(active.id, { status: "PLANNED" }); setActive(null); }} className="grid size-10 place-items-center rounded-full bg-dock-raised" aria-label="Stop"><Square className="size-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around bg-dock py-3 text-dock-muted lg:hidden">
        {[{ l: "Daily Schedule", i: Home }, { l: "Syllabus & Modules", i: LayoutGrid }, { l: "7-Day Roadmap", i: Target }, { l: "AI Studio", i: Wand2 }].map((t) => (
          <button key={t.l} onClick={() => setNav(t.l)} className={`flex flex-col items-center gap-1 text-[10px] ${nav === t.l ? "text-lime" : ""}`}><t.i className="size-5" />{t.l.split(" ")[0]}</button>
        ))}
      </nav>
    </div>
  );
}
