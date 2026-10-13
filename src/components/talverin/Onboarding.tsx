import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Briefcase, Cpu, GraduationCap, PenTool, Plus, Rocket, Search, Sparkles, Target, Trash2, Check,
} from "lucide-react";
import { AI_SUGGESTIONS, CAPACITIES, GOAL_LIBRARY, ROLES, SEED_ROUTINE, addDays, isoDate, uid } from "@/lib/talverin/data";
import type { Goal, Priority, Profile, RoutineBlock } from "@/lib/talverin/types";

const ICONS = { GraduationCap, Cpu, Briefcase, Rocket, Target, PenTool } as const;

export type OnboardingResult = { profile: Profile; routine: RoutineBlock[]; goals: Goal[] };

const pill = "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100";
const input = "w-full rounded-[14px] border border-border bg-inset px-4 py-3 text-ink outline-none transition focus:border-ink focus:bg-card";

export function Onboarding({ onDone }: { onDone: (r: OnboardingResult) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("");
  const [capacity, setCapacity] = useState("balanced");
  const [times, setTimes] = useState({ wake: "06:30", morningWork: "11:00", afternoonWork: "16:00", bedtime: "23:30" });
  const [routine, setRoutine] = useState<RoutineBlock[]>(SEED_ROUTINE);
  const [library, setLibrary] = useState(GOAL_LIBRARY);
  const [selected, setSelected] = useState<string[]>(["g-python", "g-gai"]);
  const [query, setQuery] = useState("");
  const [deadlines, setDeadlines] = useState<Record<string, { date: string; priority: Priority }>>({});

  const canNext = [name.trim().length > 0, !!role, true, selected.length > 0, selected.length > 0][step];
  const next = () => {
    if (step === 3) {
      const d: typeof deadlines = {};
      selected.forEach((id, i) => {
        d[id] = deadlines[id] ?? { date: isoDate(addDays(14 + i)), priority: i === 0 ? "High" : i === 1 ? "Medium" : "Normal" };
      });
      setDeadlines(d);
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const filtered = useMemo(
    () => library.filter((g) => g.title.toLowerCase().includes(query.toLowerCase())),
    [library, query],
  );
  const addCustom = (title: string) => {
    if (!title.trim()) return;
    const id = "c-" + uid();
    setLibrary((l) => [{ id, title: title.trim(), category: "Custom", description: "Your own learning goal.", estimatedHours: 8 }, ...l]);
    setSelected((s) => [...s, id]);
    setQuery("");
  };

  const finish = () => {
    const goals: Goal[] = selected.map((id) => {
      const g = library.find((x) => x.id === id)!;
      return { ...g, ...(deadlines[id] ?? { date: isoDate(addDays(14)), priority: "Normal" as Priority }) };
    });
    onDone({ profile: { name: name.trim(), role, capacity, ...times }, routine, goals });
  };

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="mb-8 flex w-full max-w-4xl items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-primary font-display font-bold text-lime">T</div>
          <span className="font-display text-lg font-bold text-ink">Talverin</span>
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div key={i} animate={{ width: i === step ? 28 : 8 }} className={`h-2 rounded-full ${i <= step ? "bg-primary" : "bg-track"}`} />
          ))}
          <span className="num ml-3 text-xs text-meta">{step + 1}/5</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className={`card-soft w-full p-8 md:p-10 ${step === 0 ? "max-w-xl" : "max-w-4xl"}`}
        >
          {step === 0 && (
            <div className="text-center">
              <p className="text-sm text-meta">Let's set up your study assistant</p>
              <h1 className="mt-2 text-4xl font-bold">What should we call you?</h1>
              <input
                autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canNext && next()}
                placeholder="Your name"
                className={`${input} mt-8 text-center font-display text-2xl font-semibold`}
              />
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="text-3xl font-bold">What best describes you, {name}?</h1>
              <p className="mt-1 text-meta">We'll tune session lengths and goal suggestions to your role.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ROLES.map((r, i) => {
                  const Icon = ICONS[r.icon];
                  const on = role === r.id;
                  return (
                    <motion.button
                      key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -3 }} onClick={() => setRole(r.id)}
                      className={`tile border p-5 text-left transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-ink"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className={`tile grid size-11 place-items-center ${on ? "bg-dock-raised" : "bg-inset"}`}><Icon className="size-5" /></div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${on ? "bg-lime text-lime-foreground" : "bg-inset text-meta"}`}>{r.tag}</span>
                      </div>
                      <div className={`mt-4 font-display font-semibold ${on ? "" : "text-ink"}`}>{r.title}</div>
                      <div className={`mt-1 text-sm ${on ? "text-dock-muted" : "text-meta"}`}>{r.subtitle}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-3xl font-bold">Capacity & routine</h1>
              <p className="mt-1 text-meta">How much focused time can you give each day?</p>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                {CAPACITIES.map((c) => {
                  const on = capacity === c.id;
                  return (
                    <motion.button key={c.id} whileHover={{ y: -3 }} onClick={() => setCapacity(c.id)}
                      className={`tile border p-4 text-left ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-ink"}`}>
                      <div className="num text-2xl font-semibold">{c.hours}h</div>
                      <div className="mt-1 font-display font-semibold">{c.label}</div>
                      <div className={`num mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-lime text-lime-foreground" : "bg-inset text-meta"}`}>{c.pattern}</div>
                    </motion.button>
                  );
                })}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                {([["wake", "Wake"], ["morningWork", "Morning work"], ["afternoonWork", "Afternoon work"], ["bedtime", "Bedtime"]] as const).map(([k, l]) => (
                  <label key={k} className="text-xs font-medium text-meta">{l}
                    <input type="time" value={times[k]} onChange={(e) => setTimes({ ...times, [k]: e.target.value })} className={`${input} num mt-1.5 py-2.5`} />
                  </label>
                ))}
              </div>
              <h3 className="mt-8 font-semibold">Routine blocks</h3>
              <div className="mt-3 space-y-2">
                {routine.map((r) => (
                  <div key={r.id} className="tile flex items-center gap-2 bg-inset p-2">
                    <input type="time" value={r.start} onChange={(e) => setRoutine(routine.map((x) => x.id === r.id ? { ...x, start: e.target.value } : x))} className="num rounded-[14px] bg-card px-2 py-1.5 text-sm text-ink" />
                    <span className="text-meta">–</span>
                    <input type="time" value={r.end} onChange={(e) => setRoutine(routine.map((x) => x.id === r.id ? { ...x, end: e.target.value } : x))} className="num rounded-[14px] bg-card px-2 py-1.5 text-sm text-ink" />
                    <input value={r.title} onChange={(e) => setRoutine(routine.map((x) => x.id === r.id ? { ...x, title: e.target.value } : x))} className="flex-1 rounded-[14px] bg-card px-3 py-1.5 text-sm text-ink" />
                    <button onClick={() => setRoutine(routine.filter((x) => x.id !== r.id))} className="grid size-8 place-items-center rounded-full text-meta hover:bg-card hover:text-destructive" aria-label="Delete block"><Trash2 className="size-4" /></button>
                  </div>
                ))}
                <button onClick={() => setRoutine([...routine, { id: uid(), start: "18:00", end: "18:30", title: "New block" }])}
                  className="tile flex w-full items-center justify-center gap-2 border border-dashed border-border p-3 text-sm font-medium text-meta hover:border-ink hover:text-ink">
                  <Plus className="size-4" /> Add routine block
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 className="text-3xl font-bold">What do you want to learn?</h1>
              <p className="mt-1 text-meta">Pick goals or add your own.</p>
              <div className="relative mt-6">
                <Search className="absolute left-4 top-3.5 size-4 text-meta" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom(query)} placeholder="Search goals…" className={`${input} pl-10`} />
                {query && (
                  <div className="card-soft absolute inset-x-0 top-full z-10 mt-2 overflow-hidden border border-border p-1.5">
                    <button onClick={() => addCustom(query)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-inset">
                      <Plus className="size-4" /> Add Custom Goal "{query}"
                    </button>
                    <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-meta">AI suggestions</div>
                    {AI_SUGGESTIONS.filter((s) => s.toLowerCase().includes(query.toLowerCase()) || query.length < 3).map((s) => (
                      <button key={s} onClick={() => addCustom(s)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-body hover:bg-inset">
                        <Sparkles className="size-4 text-meta" /> {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((g) => {
                  const on = selected.includes(g.id);
                  return (
                    <motion.button key={g.id} layout whileHover={{ y: -3 }}
                      onClick={() => setSelected(on ? selected.filter((x) => x !== g.id) : [...selected, g.id])}
                      className={`tile border p-4 text-left ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-ink"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-lime text-lime-foreground" : "bg-inset text-meta"}`}>{g.category}</span>
                        <span className="num text-xs">{g.estimatedHours}h</span>
                      </div>
                      <div className={`mt-3 font-display font-semibold ${on ? "" : "text-ink"}`}>{g.title}</div>
                      <div className={`mt-1 text-sm ${on ? "text-dock-muted" : "text-meta"}`}>{g.description}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h1 className="text-3xl font-bold">Set your deadlines</h1>
              <p className="mt-1 text-meta">We'll pace sessions so each goal lands on time.</p>
              <div className="mt-6 space-y-2">
                {selected.map((id) => {
                  const g = library.find((x) => x.id === id)!;
                  const d = deadlines[id] ?? { date: isoDate(addDays(14)), priority: "Normal" as Priority };
                  return (
                    <div key={id} className="tile flex flex-wrap items-center gap-3 bg-inset p-3">
                      <div className="min-w-40 flex-1">
                        <div className="font-display font-semibold text-ink">{g.title}</div>
                        <div className="num text-xs text-meta">{g.estimatedHours}h · {g.category}</div>
                      </div>
                      <input type="date" value={d.date} onChange={(e) => setDeadlines({ ...deadlines, [id]: { ...d, date: e.target.value } })} className="num rounded-[14px] border border-border bg-card px-3 py-2 text-sm text-ink" />
                      <div className="flex rounded-full bg-card p-1">
                        {(["High", "Medium", "Normal"] as Priority[]).map((p) => (
                          <button key={p} onClick={() => setDeadlines({ ...deadlines, [id]: { ...d, priority: p } })}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${d.priority === p ? "bg-primary text-primary-foreground" : "text-meta hover:text-ink"}`}>{p}</button>
                        ))}
                      </div>
                      <button onClick={() => setSelected(selected.filter((x) => x !== id))} className="grid size-9 place-items-center rounded-full text-meta hover:bg-card hover:text-destructive" aria-label="Remove goal"><Trash2 className="size-4" /></button>
                    </div>
                  );
                })}
              </div>
              <button disabled={!selected.length} onClick={finish} className={`${pill} shimmer mt-8 w-full py-5 text-base`}>
                <Sparkles className="size-5" /> Build Personalized Schedule
              </button>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-meta hover:text-ink"><ArrowLeft className="size-4" /> Back</button>
            ) : <span />}
            {step < 4 && (
              <button disabled={!canNext} onClick={next} className={pill}>
                {step === 3 ? <>Continue with <span className="num">{selected.length}</span> {selected.length === 1 ? "goal" : "goals"}</> : "Continue"}
                {step === 3 && selected.length > 0 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
