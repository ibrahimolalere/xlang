import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { Providers } from '@/components/providers';

import './globals.css';

const outfit = localFont({
  src: [
    {
      path: '../public/Outfit/Outfit-VariableFont_wght.ttf',
      weight: '100 900',
      style: 'normal'
    }
  ],
  variable: '--font-outfit',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'XLang | German Video Learning',
  description: 'Level-based German video platform with synced transcript learning.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
    apple: ['/favicon.svg']
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} font-sans antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
