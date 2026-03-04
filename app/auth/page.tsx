import { AuthForm } from '@/components/auth/auth-form';
import { BrandLogo } from '@/components/brand-logo';
import { LockKeyhole } from 'lucide-react';

export default function AuthPage() {
  return (
    <section className="mx-auto w-full max-w-xl space-y-5">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <div className="mb-3 inline-flex items-center gap-2">
          <BrandLogo size="sm" />
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <LockKeyhole className="h-4 w-4 text-accent" />
          Account
        </p>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Sign in to XLang
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
          Use your email/password or continue with Google.
        </p>
      </div>

      <AuthForm />
    </section>
  );
}
