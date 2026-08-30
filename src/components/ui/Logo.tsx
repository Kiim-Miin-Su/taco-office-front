/**
 * TN 마크 — **로고가 그려지는 단 하나의 자리.**
 *
 * 상단 바 · 로그인 · 파비콘이 전부 이것을 쓴다. 화면마다 `<img src="...">` 를 적으면
 * 로고를 바꿀 때 세 군데를 고쳐야 하고, 한 군데는 반드시 빠진다.
 *
 * 파일은 `public/tn-mark.svg` 하나다. 바꾸실 때 그 파일만 갈아 끼우면
 * 상단 바·로그인·브라우저 탭이 **함께** 바뀐다.
 */
import Image from 'next/image';
import { cn } from './cn';

export interface LogoProps {
  /** 마크 크기(px). 글자는 이 값에 비례한다 */
  size?: number;
  /** 마크 옆에 이름을 함께 둘지 */
  withName?: boolean;
  /** 어두운 바탕 위인지 — 상단 바가 어둡다 */
  onDark?: boolean;
  className?: string;
}

export function Logo({ size = 22, withName = true, onDark = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2', className)}>
      <Image
        src="/tn-mark.svg"
        alt="티엔아카데미"
        width={size}
        height={size}
        priority
        // 마크는 화면 폭이 바뀌어도 비율이 흔들리면 안 된다
        style={{ width: size, height: size }}
      />
      {withName ? (
        <span
          className={cn('font-bold tracking-tight', onDark ? 'text-white' : 'text-fg')}
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          TACO ERP
        </span>
      ) : null}
    </span>
  );
}
