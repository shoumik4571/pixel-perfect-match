export type Priority = "High" | "Medium" | "Normal";
export type Goal = {
  id: string;
  title: string;
  category: string;
  description: string;
  estimatedHours: number;
  date: string; // YYYY-MM-DD
  priority: Priority;
};
export type ItemStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "MISSED";
export type ScheduleItem = {
  id: string;
  start: string; // HH:MM
  end: string;
  durationMinutes: number;
  title: string;
  type: "routine" | "deep-work";
  goal?: string;
  deadline?: string;
  status: ItemStatus;
};
export type DaySchedule = { date: string; totalGoalMinutes: number; items: ScheduleItem[] };
export type RoutineBlock = { id: string; start: string; end: string; title: string };
export type Capacity = { id: string; label: string; hours: number; pattern: string };
export type Profile = {
  name: string;
  role: string;
  capacity: string;
  wake: string;
  morningWork: string;
  afternoonWork: string;
  bedtime: string;
};
