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
