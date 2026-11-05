# Pitchside

Pitchside is a Next.js App Router application built with TypeScript and
Tailwind CSS.

## Requirements

- Node.js 20.9 or later
- npm

## Getting started

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a local environment file and add your API keys, model names, and a
   positive integer `BRIEF_BUDGET_MAX_TOKENS` limit:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   On macOS or Linux, use `cp .env.example .env.local`.

3. Start the development server:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Keep actual credentials in `.env.local`; do not commit them.

## Generate a brief

`POST /api/brief` streams Server-Sent Events. Send a selected candidate and
brief input as JSON:

```json
{
  "candidate": {
    "type": "firm",
    "name": "Example Ventures",
    "officialDomain": "example.com",
    "descriptor": "Venture capital firm",
    "matchScore": 0.9
  },
  "briefInput": {
    "investor": "Example Ventures",
    "meetingAt": "2026-11-05T07:30:00Z",
    "meetingType": "intro",
    "startup": {
      "oneLiner": "Workflow tools for logistics",
      "sector": "logistics software",
      "stage": "seed",
      "raiseSize": "$2M"
    }
  }
}
```

Progress events identify the active pipeline stage; the `complete` event
contains the finalized brief and accumulated run stats. An `error` event is
sent if generation fails or the measured LLM token usage exceeds the configured
limit.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint

## Project structure

- `app/` — App Router pages and API routes
- `components/` — reusable UI components
- `lib/` — shared application code
- `lib/pipeline/` — brief-generation pipeline
- `types/` — shared TypeScript types
