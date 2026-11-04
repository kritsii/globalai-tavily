export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-24 font-sans">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Pitchside
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950">
          Investor research, with receipts.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600">
          A one-page, source-backed investor brief for founders. Your workspace
          is ready to build.
        </p>
      </div>
    </main>
  );
}
