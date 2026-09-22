export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form
        method="POST"
        action="/api/gate"
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <h1 className="text-lg font-semibold text-white">Leonyx AI DM Suite</h1>
        <p className="text-sm text-white/60">Enter the access password to continue.</p>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white outline-none focus:border-white/30"
        />
        {error && <p className="text-sm text-rose-400">Wrong password.</p>}
        <button type="submit" className="w-full rounded-lg bg-white py-2 font-medium text-black">
          Continue
        </button>
      </form>
    </div>
  );
}
