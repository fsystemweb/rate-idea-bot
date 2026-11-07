# AGENTS.md

`rate-idea-bot` is a Playwright and OpenAI bot that comments on, ranks and creates ideas on rateidea.us, run daily by GitHub Actions.

## Commands
- Install: `npm install`, then `npx playwright install --with-deps chromium`
- Run the bot: `npm start` (runs `ts-node src/bot.ts` against the live site)
- Type-check: `npx tsc --noEmit`
- Lint and tests: none configured

## Conventions
- TypeScript (strict, CommonJS) run with `ts-node`; Playwright, OpenAI SDK 4.x, dotenv. npm lockfile. CI uses Node 22.
- `src/bot.ts`: orchestrator, decides by day of month which actions run. `src/commentAndRank.ts` and `src/createIdea.ts`: the actions. `src/utils.ts`: OpenAI client, `WEBSITE_URL`, delays. `src/prompts/`: LLM prompt text.
- The bot drives the real production site; keep `humanDelay` pauses between actions and do not add loops that post in bulk.
- `.github/workflows/bot.yml` runs `npm start` daily (08:00 UTC) and on manual dispatch, with the OpenAI key from a GitHub secret.
- Local config goes in an untracked `.env` (see the README for the setup); there is no `.env.example` despite what the README says.
- `.agent/skills/playwright-skill/` is a vendored third-party skill; do not edit it.

## Boundaries
- Always: run `npx tsc --noEmit` before finishing a change.
- Ask first: adding a dependency, changing the schedule or the CI workflow, changing what or how often the bot posts to the live site.
- Never: commit secrets or read `.env` files; point the bot at production just to test a change (it posts for real).
