/** @file-guide
 * 목적: 개발명세서 §39 교재 카드의 레벨 의미색 · 시험 태그 칩 톤 · 과목 색을 한 선택기로 제공한다.
 * 책임/재사용: 서버 레벨 라벨을 보존하고 Foundation/Practice/Master의 확정 의미만 시각 토큰에 연결한다. 낱말은 서버 값만 쓴다(D-R18).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ChipTone } from '@/components/ui';

export interface BookLevelPresentation {
  /** 화면에 쓰는 서버 원문. 알 수 없는 값을 F/P/M으로 바꾸지 않는다. */
  label: string;
  /** 원본 카드 띠의 F/P/M. 미확정 레벨은 서버 원문을 그대로 쓴다. */
  marker: string;
  /** 카드 세로 띠에 쓰는 공용 의미색 토큰. */
  bandClass: string;
}

const BOOK_LEVEL_PRESENTATION: Readonly<Record<string, Omit<BookLevelPresentation, 'label'>>> = {
  Foundation: { marker: 'F', bandClass: 'bg-red' },
  Practice: { marker: 'P', bandClass: 'bg-amber' },
  Master: { marker: 'M', bandClass: 'bg-green' },
};

/** §39의 세 확정 레벨만 색을 고른다. AP/SAT/B2 같은 서버값은 중립색과 원문을 유지한다. */
export function bookLevelPresentation(level: string | null | undefined): BookLevelPresentation {
  const label = level?.trim() || '—';
  return { label, ...(BOOK_LEVEL_PRESENTATION[label] ?? { marker: label, bandClass: 'bg-fg-2' }) };
}

/**
 * 시험 태그 칩의 톤 — 원문 §39 카드: SAT 진한 채움 · MAP 청록 · ISEE / SSAT 보라 (N-47 · 컷 실측).
 * 키는 서버 `examTag`, 글자는 서버 `examTagLabel` 이다. 모르는 키는 중립.
 */
const BOOK_EXAM_TONE: Readonly<Record<string, ChipTone>> = { sat: 'neutral', map: 'teal', isee_ssat: 'purple' };
export const bookExamTagTone = (tag: string | null | undefined): ChipTone => (tag ? BOOK_EXAM_TONE[tag] : undefined) ?? 'neutral';

/** 교재 과목 색 — 서버 코드표 값(#RRGGBB)만 받는다. 모양이 틀리면 중립 토큰 (D-R41 · 화면에 색 값을 적지 않는다) */
export function bookSubjectColor(color: string | null | undefined): string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : 'var(--fg-subtle)';
}

/**
 * 배부 형태 칩의 톤 — 원문 §38 교재 칸 아래: 「PDF」 파랑 채움 · 「실물 책」 주황 채움 (7-3 §38-2 · W11 A' · 컷 실측).
 * 키는 서버 `form`, 글자는 서버 `formLabel` 이다. 모르는 키는 중립.
 */
const ISSUE_FORM_TONE: Readonly<Record<string, ChipTone>> = { pdf: 'info', print: 'orange' };
export const issueFormTone = (form: string | null | undefined): ChipTone => (form ? ISSUE_FORM_TONE[form] : undefined) ?? 'neutral';
