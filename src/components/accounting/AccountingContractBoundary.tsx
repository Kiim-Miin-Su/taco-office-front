/** @file-guide
 * 목적: 최신 회계 요구 화면에서 생성 DTO가 아직 없는 읽기·쓰기 경계와 인접 업무 이동을 표시한다. (component)
 * 책임/재사용: 요구 필드와 계약 부재만 설명하며 기존 입금·정산 데이터를 새 원장 값으로 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { Banner, Button, Chip, Panel } from '@/components/ui';

export function AccountingContractBoundary({
  title,
  description,
  fields,
  nextLabel,
  onNext,
}: {
  title: string;
  description: string;
  fields: readonly string[];
  nextLabel: string;
  onNext: () => void;
}) {
  return (
    <Panel>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1"><Chip tone="warning">저장 기능 준비 중</Chip></div>
          <h2 className="text-[15px] font-bold text-fg">{title}</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-fg-subtle">{description}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onNext}>{nextLabel}</Button>
      </header>
      <Banner tone="neutral" className="mb-3">
        화면 구조와 이동 경로만 제공합니다. 아래 값을 정확히 저장할 수 있기 전에는 기존 입금·정산 값을 조합해 표시하거나 완료 처리하지 않습니다.
      </Banner>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={`${title} 필요 필드`}>
        {fields.map((field) => (
          <div key={field} className="rounded-lg border border-dashed border-line-2 bg-inset px-3 py-2 text-[12px] font-medium text-fg-2">
            {field}
          </div>
        ))}
      </div>
    </Panel>
  );
}

