import { useEffect, useRef } from 'react';
import { useCountUp, useGrowIn, useReducedMotion } from '../../state/motion';

/** A number that counts up to its value (the final number is what is there once the count finishes). */
export function CountUp({ value }: { value: number }) {
  const shown = useCountUp(value);
  return <span className="num">{shown}</span>;
}

/** The coloured part of a progress bar: fills in from empty. `pct` is 0 to 100. */
export function GrowBar({ pct, className }: { pct: number; className: string }) {
  const width = useGrowIn(pct);
  return <div className={`${className} transition-[width] duration-700 ease-out`} style={{ width: `${width}%` }} />;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
  round: boolean;
}

const COLOURS = ['--sun', '--coral', '--teal', '--lilac', '--sky', '--accent'];
const LIFETIME_MS = 2200;

/**
 * A short burst of confetti over the page, then it clears itself. Decoration only: ignores the mouse, hidden from screen
 * readers, and not drawn at all when the person prefers reduced motion.
 */
export function Confetti({ pieces = 110 }: { pieces?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (reduce || !el || !ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    el.width = width * ratio;
    el.height = height * ratio;
    ctx.scale(ratio, ratio);

    const style = getComputedStyle(document.documentElement);
    const colours = COLOURS.map((name) => style.getPropertyValue(name).trim() || '#ffb800');
    const parts: Piece[] = Array.from({ length: pieces }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1; // two bursts, from either side of the middle
      const angle = (-Math.PI / 2) + side * (0.25 + Math.random() * 0.9);
      const speed = 9 + Math.random() * 9;
      return {
        x: width / 2 + side * width * 0.12,
        y: height * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 7,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        color: colours[Math.floor(Math.random() * colours.length)],
        round: Math.random() < 0.3,
      };
    });

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const age = now - started;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.max(0, Math.min(1, (LIFETIME_MS - age) / 600));
      for (const p of parts) {
        p.vy += 0.38; // gravity
        p.vx *= 0.985; // air
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (age < LIFETIME_MS) frame = window.requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reduce, pieces]);

  if (reduce) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[100] size-full" />;
}
