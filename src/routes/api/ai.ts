import { createFileRoute } from "@tanstack/react-router";

// Thin mount for the user's existing AI handler (kept unchanged in ai-route.server.ts).
export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { POST } = await import("@/lib/talverin/ai-route.server");
        return POST(request);
      },
    },
  },
});
