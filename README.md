# Futura 2035 — milestone 1

A parent enters a child's interests and their hopes, explores up to three AI-generated 2035 careers, chooses one and sees four illustrated day-in-the-life panels. No login, payments, PDF, skill map or roadmap.

## Run locally

```sh
npm install
npm run dev:backend
npm run dev
```

This folder owns Convex project `futura-2035`, development deployment `doting-basilisk-558`. The private GitHub repository is https://github.com/reachprabhat/futura-2035.

Add `OPENAI_API_KEY` only to this deployment's Convex Settings → Environment Variables. Never put the key in a source file, a `VITE_` variable, a local environment file or GitHub. `.env.local` contains public Convex connection details and stays ignored.

## AI behavior and limits

All OpenAI calls run in `convex/ai.ts` actions. Careers use `gpt-4.1` with web search and a maximum reply of 3,000 tokens (pieces of text). Scene planning uses `gpt-4.1-mini` with a maximum reply of 1,800 tokens. Images use `gpt-image-1`, four calls at most per fresh storyboard, each limited to one low-quality 1024×1024 WebP image and an 1,800-character prompt. SDK automatic retries are disabled.

Every OpenAI request reserves one call in an atomic Convex mutation, including failed calls. The global daily cap is 100 calls per UTC day; `AI_DAILY_CALL_CAP` in Convex can lower this from 1 to 100. OpenAI web search may have separate tool charges; the limit counts API requests, not dollars or internal tool invocations. A fresh complete flow needs six calls (one career reply, one scene reply, four illustrations).

Equivalent comma-separated inputs reuse saved career recommendations. Storyboards are indexed by normalized career title. Their images live in Convex file storage, linked to the title in the `storyboards` table. Completed storyboards are reused across searches; a generation lease prevents concurrent duplicates. Captions survive image failures, and retries request only missing illustrations. Incomplete attempts show the path that ran and a Try again button. Salaries are illustrative INR annual ranges in today's purchasing power, not verified 2035 forecasts.

Inputs and AI responses are stored in this development project's Convex database for reuse. No data is read from any other local project.

## Checks

```sh
npm run build
npm run test:backend
node scripts/check-browser.mjs
```

The browser check uses the requested example and writes full unedited Convex action responses to `artifacts/raw-dev-output.json`, plus phone-width screenshots. It requires an installed Playwright Chromium browser and a running local frontend. Run `npx playwright install chromium` once if needed.

Hosting is not configured in milestone 1: this task is verified on development. Any future publishing must use Convex static hosting and the requested `convex-dev-static-hosting` skill. That skill was not present in this folder or the available skill directories during setup.
