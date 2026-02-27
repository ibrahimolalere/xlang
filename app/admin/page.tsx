import { AdminUploadForm } from '@/components/admin-upload-form';
import { Shield } from 'lucide-react';

export default function AdminPage() {
  return (
    <section className="space-y-5 sm:space-y-6">
      <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent sm:text-xs">
        <Shield className="h-4 w-4" />
        Admin
      </p>
      <h1 className="font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
        Upload Video Content
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
        Upload local video files to a CEFR level and optionally attach transcript rows.
      </p>
      <AdminUploadForm />
    </section>
  );
}
