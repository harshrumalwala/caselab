import { splitMarkClass, splitTabClass, splitTabsClass } from '../../components/ui/splitTab';
import { SlideRow } from '../../components/ui/useSlidingMark';

/**
 * The two views of the My Case Log tab: the cases themselves, and the Improvement Areas they add up to. One control split across the
 * full width, like the Community tab's, so the top bar needs one tab for both.
 */
export function LogViewTabs({ current }: { current: 'cases' | 'improve' }) {
  return (
    <SlideRow as="nav" aria-label="Case log sections" activeKey={current} markClass={splitMarkClass} className={splitTabsClass}>
      <a
        href="#/log"
        aria-current={current === 'cases' ? 'page' : undefined}
        data-slide-active={current === 'cases' ? 'true' : undefined}
        className={splitTabClass(current === 'cases')}
      >
        Cases
      </a>
      <a
        href="#/improve"
        aria-current={current === 'improve' ? 'page' : undefined}
        data-slide-active={current === 'improve' ? 'true' : undefined}
        className={splitTabClass(current === 'improve')}
      >
        Improvement Areas
      </a>
    </SlideRow>
  );
}
