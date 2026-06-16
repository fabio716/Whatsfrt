// Next.js chama register() uma vez por processo Node.js no boot do servidor.
// É o lugar correto para subir os workers de reliability (queue, watchdog,
// reaper) — eles ficam vivos pelo lifetime do processo, são tear-down via
// signal handlers no shutdown.

export async function register(): Promise<void> {
  // Edge runtime não tem Redis client nem timers contínuos — pula.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startReliabilityWorkers } = await import("@/lib/reliability/bootstrap")
  await startReliabilityWorkers()
}
