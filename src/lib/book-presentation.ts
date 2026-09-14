/** @file-guide
 * 목적: 개발명세서 §39 교재 카드의 레벨 의미색을 한 선택기로 제공한다.
 * 책임/재사용: 서버 레벨 라벨을 보존하고 Foundation/Practice/Master의 확정 의미만 시각 토큰에 연결한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

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
