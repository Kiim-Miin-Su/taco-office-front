/** @file-guide
 * 목적: SearchEmpty.tsx — SearchEmpty (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { Button } from './Button';

/** UI/Search Empty — 원본 검색 규칙에서 파생한 빈 상태. 데이터 삭제와 구분한다. */
export function SearchEmpty({ onClear, title = '검색 결과가 없습니다', hint = '검색어를 바꾸거나 초기화해 주세요' }: {
  onClear: () => void; title?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card p-6 text-center">
      <p className="text-[14px] font-bold leading-5 text-fg">{title}</p>
      <p className="text-[11px] leading-4 text-fg-2">{hint}</p>
      <Button size="sm" className="!h-7" onClick={onClear}>초기화</Button>
    </div>
  );
}
