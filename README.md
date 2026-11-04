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

2. Create a local environment file and add your API keys and model names:

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
