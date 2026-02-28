import { AdminUploadForm } from '@/components/admin-upload-form';
import { Shield } from 'lucide-react';

export default function AdminPage() {
  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <Shield className="h-4 w-4 text-accent" />
          Studio
        </p>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
          Upload Video Content
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Upload local video files to a CEFR level and optionally attach transcript rows.
        </p>
      </div>
      <AdminUploadForm />
    </section>
  );
}
