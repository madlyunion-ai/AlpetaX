'use client';

import { useEffect, useRef } from 'react';

/**
 * 스크롤 중에만 스크롤바 손잡이를 드러낸다.
 *
 * CSS 의 :hover 만으로는 "마우스를 올렸을 때"까지만 되고, 휠로 굴리는 동안은
 * 포인터가 목록 밖에 있을 수 있다. 그래서 스크롤 이벤트로 data-scrolling 을
 * 잠깐 세워 둔다. 값이 사라지는 시점은 CSS 의 transition 이 부드럽게 받는다.
 */
export function useQuietScroll<T extends HTMLElement>(idleMs = 700) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      el.dataset.scrolling = 'true';
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.dataset.scrolling = 'false';
      }, idleMs);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [idleMs]);

  return ref;
}
