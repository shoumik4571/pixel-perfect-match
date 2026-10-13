import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Onboarding, type OnboardingResult } from "@/components/talverin/Onboarding";
import { Workspace } from "@/components/talverin/Workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talverin — Personal AI Study Assistant" },
      { name: "description", content: "Talverin interviews you, then builds a personalized daily study schedule around your goals and routine." },
      { property: "og:title", content: "Talverin — Personal AI Study Assistant" },
      { property: "og:description", content: "A personalized daily study schedule built around your goals and routine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [run, setRun] = useState(0);
  if (!result) return <Onboarding onDone={(r) => { setResult(r); setRun((n) => n + 1); }} />;
  return <Workspace key={run} {...result} onEditGoals={() => setResult(null)} />;
  // result includes optional AI plan (null when offline fallback was used)
}
