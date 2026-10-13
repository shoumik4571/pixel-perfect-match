<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Rules
- `src/lib/talverin/ai-route.server.ts` is the user's original AI handler copied verbatim (only the NextResponse import shimmed); never rewrite its prompts or logic. `src/routes/api/ai.ts` only forwards to it. Why: user mandated the backend stays untouched.
- All UI AI calls go through `callAi` in `src/lib/talverin/ai.ts` and must catch errors with a local fallback + toast. Why: app must stay usable without keys/offline.
