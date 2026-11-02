import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../state/motion';

const BASE = import.meta.env.BASE_URL;
export const HERO_VIDEO = `${BASE}hero/loop.mp4`;
export const HERO_POSTER = `${BASE}hero/poster.jpg`;

/** True where the person asked their browser to save data (`navigator.connection.saveData`). */
function savingData(): boolean {
  return Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
}

/**
 * The looping illustration on the front page: students casing in a study room. Purely decorative, so it is hidden from
 * screen readers, has no controls and no sound. It is a still picture instead of a video when the person prefers reduced
 * motion or is saving data, when the video can't load, and (to spare the battery) it pauses while scrolled out of view.
 */
export function HeroVideo({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const still = reduce || failed || savingData();

  useEffect(() => {
    const video = ref.current;
    if (still || !video) return;
    video.muted = true; // React doesn't always write the attribute, and browsers only autoplay muted video
    if (typeof IntersectionObserver !== 'function') return;
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    watcher.observe(video);
    return () => watcher.disconnect();
  }, [still]);

  return (
    <div className={`sticker aspect-video overflow-hidden bg-sun-soft ${className}`} aria-hidden="true">
      {still ? (
        <img src={HERO_POSTER} alt="" className="size-full object-cover" />
      ) : (
        <video
          ref={ref}
          className="size-full object-cover"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
