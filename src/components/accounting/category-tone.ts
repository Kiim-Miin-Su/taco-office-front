/** @file-guide
 * 목적: category-tone.ts — categoryTone, categoryChip (constant)
 * 책임/재사용: 회계 분류(입금 여섯 · 청구 종류)의 **빛깔 한 벌**. 값이 아니라 토큰 클래스 이름만 둔다 — 색 값은 tokens.css 한 곳이다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §55 분류 칩의 색 사각형과 §57 줄의 점·띠는 **같은 색**이다 — 원문이 두 컷에서 같은 빛깔을 쓴다(55-05 · 57-02).
 * 두 화면이 각자 표를 들면 한쪽만 바뀌어 같은 분류가 두 색이 된다. 그래서 여기 한 벌만 둔다.
 *
 * 키는 서버의 입금 분류 키(`PAY_CATEGORIES`)이고, 그 밖의 수입 줄의 키(청구 종류)도 같은 낱말을 쓴다
 * (컨설팅비 · 진단고사 · 응시료가 두 축에 같은 키로 선다).
 *
 * 빛깔은 **토큰**에서만 고른다(D-R41) — 수업료 파랑 · GPA 보라 · 컨설팅 분홍 · 진단 청록 · 응시료 주황 · 기타 회청.
 * 컨설팅·진단·응시료는 원문 컷(§55 분류 칩 · #DB2777 · #0891B2 · #EA580C)의 분홍·청록·주황 계열 전용 토큰
 * (`pink` · `teal` · `orange`)이다 — 예전에 빌려 쓰던 수업 종류 색(kind-consulting · kind-consult · kind-mock)은
 * 수업 종류의 뜻이라 돌려놓았다. 값·대비는 tokens.css · tokens.test.ts 한 곳.
 */
import type { ChipColor } from '@/components/ui';

const TONE: Record<string, string> = {
  tuition: 'bg-blue',
  gpa: 'bg-kind-gpa',
  consulting: 'bg-pink',
  diag_intake: 'bg-teal',
  exam_fee: 'bg-orange',
  etc: 'bg-kind-diagx',
};

/** 분류 키 → 배경 클래스. 모르는 키는 흐린 회색 — 새 분류가 서버에 생겨도 화면이 깨지지 않는다 */
export function categoryTone(key: string): string {
  return TONE[key] ?? 'bg-fg-subtle';
}

/**
 * 청구 종류 키 → 칩 색 (W11 · §53 카드의 종류 칩 — 「수업료 청구」 파랑 · 「컨설팅비 청구」 분홍).
 * 위 표와 **같은 빛깔**이다(수업료 파랑 · 컨설팅 분홍 · 진단 청록 · 응시료 주황) — 칩은 톤 이름을 받으므로 한 벌을 톤으로 옮겨 적었다.
 * 모르는 종류는 회색.
 */
const CHIP: Record<string, ChipColor> = {
  tuition: 'info',
  consulting: 'pink',
  diag_intake: 'teal',
  exam_fee: 'orange',
};

export function categoryChip(key: string): ChipColor {
  return CHIP[key] ?? 'neutral';
}
