/** @file-guide
 * 목적: format.ts — hm, hours, md, dowOf, REP (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 표면 공용 표기 — 홈·수업 히스토리가 같은 이름표를 쓴다.
 * 판정은 전부 서버 값(repState·pay·차감)이고, 여기는 **표기만** 있다 (SKILLS §3).
 */
import type { Tone } from '@/components/ui';

/** 0~1439 분 → 'HH:mm' */
export const hm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 분 → 시간 문자열 — 정각이면 정수, 아니면 소수 한 자리 */
export const hours = (min: number): string => (min % 60 === 0 ? String(min / 60) : (min / 60).toFixed(1));

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 'YYYY-MM-DD' → 요일 한 글자. KST 날짜이므로 정오 UTC 로 고정해 경계 이동이 없다. */
export const dowOf = (iso: string): string => DOW[new Date(`${iso}T09:00:00Z`).getUTCDay()] ?? '';

/** 'YYYY-MM-DD' → 'M/D 요일' */
export const md = (iso: string): string => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))} ${dowOf(iso)}`;

/** rep_state_t 이름표 — 서버 상태 그대로, 여기는 표기만 (SKILLS §3). */
export const REP: Record<string, { label: string; tone: Tone } | undefined> = {
  none: { label: '리포트 미작성', tone: 'danger' },
  draft: { label: '작성 중', tone: 'warning' },
  wait: { label: '승인 대기', tone: 'warning' },
  ok: { label: '승인 완료', tone: 'success' },
  rej: { label: '반려', tone: 'danger' },
  plan: { label: '수업 예정', tone: 'info' },
};
