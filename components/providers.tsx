'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';

import { SupabaseAuthProvider } from '@/components/auth/supabase-auth-provider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
    </ThemeProvider>
  );
}
