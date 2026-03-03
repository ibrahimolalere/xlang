import { Cog } from 'lucide-react';

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-7">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <Cog className="h-4 w-4 text-accent" />
          Settings
        </p>
        <h1 className="mt-4 max-w-4xl font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Platform Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Manage account and learning preferences here.
        </p>
      </div>
    </section>
  );
}
