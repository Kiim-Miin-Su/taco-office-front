/** @file-guide
 * 목적: Logo.tsx — LogoProps, Logo (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

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
  /** 관리자 원본 헤더는 TN 그림 없이 동일한 제품 wordmark만 쓴다. */
  withMark?: boolean;
  /** 어두운 바탕 위인지 — 상단 바가 어둡다 */
  onDark?: boolean;
  /**
   * 이름 아래 작은 조직 줄 — 강사 덱·Figma `UI/Wordmark` Context=Menu 의 「TN Academy」.
   * 없으면(기본) 한 줄 그대로다.
   */
  org?: string;
  /** 이름 글자색 — 'primary' 는 강사 메뉴 패널의 브랜드색 wordmark(Context=Menu). 기본은 지금 그대로(fg / 어두운 바탕이면 흰색) */
  tone?: 'default' | 'primary';
  className?: string;
}

export function Logo({
  size = 22, withName = true, withMark = true, onDark = false, org, tone = 'default', className,
}: LogoProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2', className)}>
      {withMark ? <Image
        src="/tn-mark.svg"
        alt="티엔아카데미"
        width={size}
        height={size}
        priority
        // 마크는 화면 폭이 바뀌어도 비율이 흔들리면 안 된다
        style={{ width: size, height: size }}
      /> : null}
      {withName ? (() => {
        const name = (
          <span
            className={cn('font-bold tracking-tight', onDark ? 'text-white' : tone === 'primary' ? 'text-primary' : 'text-fg')}
            style={{ fontSize: Math.round(size * 0.62) }}
          >
            TACO ERP
          </span>
        );
        // 조직 줄이 없으면 예전 DOM 그대로(한 span) — 기존 소비처의 모양·시험이 바뀌지 않는다
        return org ? (
          <span className="flex flex-col">
            {name}
            <span className={cn('text-[11px] font-medium leading-4', onDark ? 'text-line-2' : 'text-fg-subtle')}>{org}</span>
          </span>
        ) : name;
      })() : null}
    </span>
  );
}
