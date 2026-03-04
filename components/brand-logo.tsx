import Image from 'next/image';

import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: 'sm' | 'md';
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ size = 'md', className, priority = false }: BrandLogoProps) {
  const sizeClass = size === 'sm' ? 'h-6' : 'h-7';

  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <Image
        src="/logo-mark.svg"
        alt="XLang logo"
        width={108}
        height={38}
        className={cn(sizeClass, 'w-auto dark:hidden')}
        priority={priority}
      />
      <Image
        src="/logo-mark-white.svg"
        alt="XLang logo"
        width={108}
        height={38}
        className={cn('hidden w-auto dark:block', sizeClass)}
        priority={priority}
      />
    </span>
  );
}
