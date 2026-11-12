import type { ReactNode } from 'react';
import { BucketAvatar, type BucketMood } from '../improvement/BucketAvatar';

/** Bucket with a speech bubble: the guide that stays with the member through the whole case. */
export function BucketSays({
  mood = 'happy',
  children,
  big = false,
  className = '',
}: {
  mood?: BucketMood;
  children: ReactNode;
  big?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <BucketAvatar
        mood={mood}
        className={`shrink-0 ${mood === 'worried' ? 'animate-wiggle' : mood === 'cheer' ? 'animate-bump' : 'animate-bob'} ${big ? 'size-24 sm:size-28' : 'size-14 sm:size-16'}`}
      />
      <div className="relative min-w-0 rounded-2xl rounded-bl-md border-2 border-ink/80 bg-surface px-4 py-3 text-sm font-medium leading-relaxed text-ink shadow-[3px_4px_0_0_rgb(28_26_24/0.85)] dark:border-ink dark:shadow-[3px_4px_0_0_rgb(0_0_0/0.7)]">
        {children}
      </div>
    </div>
  );
}
