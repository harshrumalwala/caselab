import {
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarRange,
  Calculator,
  ClipboardCheck,
  Compass,
  Crown,
  Factory,
  Flag,
  Flame,
  GraduationCap,
  Handshake,
  Lock,
  Medal,
  PenLine,
  Presentation,
  ScrollText,
  Shapes,
  Star,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { stickerBook, type Sticker, type StickerIcon, type StickerTone } from '../../domain/stickers';
import type { CaseRecord } from '../../domain/types';

const ICONS: Record<StickerIcon, LucideIcon> = {
  flag: Flag,
  shapes: Shapes,
  building: Building2,
  factory: Factory,
  star: Star,
  pen: PenLine,
  graduation: GraduationCap,
  flame: Flame,
  calendarCheck: CalendarCheck,
  calendarRange: CalendarRange,
  handshake: Handshake,
  trending: TrendingUp,
  medal: Medal,
  trophy: Trophy,
  scroll: ScrollText,
  compass: Compass,
  calculator: Calculator,
  briefcase: Briefcase,
  presentation: Presentation,
  clipboard: ClipboardCheck,
  crown: Crown,
};

/** Spelled out in full so Tailwind can see each class. */
const TONE: Record<StickerTone, string> = {
  sun: 'bg-sun text-on-sun',
  teal: 'bg-teal text-on-color',
  coral: 'bg-coral text-on-color',
  lilac: 'bg-lilac text-on-color',
  sky: 'bg-sky text-on-color',
};

/** Each sticker is tilted a little differently, always the same way for the same sticker, like a real sticker sheet. */
const TILT = ['-rotate-3', 'rotate-2', '-rotate-1', 'rotate-3', 'rotate-1', '-rotate-2'];

function Tile({ sticker, index }: { sticker: Sticker; index: number }) {
  const Icon = ICONS[sticker.icon];
  return (
    <li
      aria-label={`${sticker.name}: ${sticker.earned ? 'earned' : `locked. ${sticker.how}`}`}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center ${
        sticker.earned ? 'border-ink/80 bg-surface shadow-[2px_2px_0_0_rgb(28_26_24/0.85)]' : 'border-dashed border-line bg-bg'
      }`}
    >
      <span
        aria-hidden
        className={`flex size-12 items-center justify-center rounded-full border-2 ${
          sticker.earned ? `${TONE[sticker.tone]} ${TILT[index % TILT.length]} border-ink/80 shadow-[1px_2px_0_0_rgb(28_26_24/0.85)]` : 'border-line bg-surface-2 text-muted/60'
        }`}
      >
        {!sticker.earned ? <Lock className="size-5" /> : sticker.mark ? <span className="num font-display text-lg font-extrabold leading-none">{sticker.mark}</span> : <Icon className="size-6" />}
      </span>
      <span className={`text-xs font-bold leading-tight ${sticker.earned ? 'text-ink' : 'text-muted'}`}>{sticker.name}</span>
      <span className="text-[11px] leading-tight text-ink-2">{sticker.how}</span>
    </li>
  );
}

/** Every sticker there is to collect: the earned ones in colour, the rest locked with a hint of how to get them. */
export function StickerBook({ cases }: { cases: CaseRecord[] }) {
  const book = stickerBook(cases);
  const got = book.filter((s) => s.earned).length;
  return (
    <div>
      <p className="font-display text-lg font-extrabold text-ink" aria-live="polite">
        {got} of {book.length} stickers
      </p>
      <p className="text-sm text-ink-2">Collected from your log as you go. If you delete the cases behind one, it goes with them.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Sticker book">
        {book.map((s, i) => (
          <Tile key={s.id} sticker={s} index={i} />
        ))}
      </ul>
    </div>
  );
}
