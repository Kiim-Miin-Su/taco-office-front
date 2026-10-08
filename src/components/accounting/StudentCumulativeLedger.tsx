/** @file-guide
 * 목적: TBO-55 BO-11AD-02 학생별 누적 원장의 최근 3개월·전체 누적·미수·분류를 표시한다. (component)
 * 책임/재사용: 생성 DTO를 그대로 표시하며 매출·수납·월평균·미수 계산을 화면에서 다시 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import type { StudentCumulative, StudentCumulativeRow } from '@/api/types';
import { Chip, Panel, QueryState } from '@/components/ui';
import { won } from '@/lib/money';
import type { UseQueryResult } from '@tanstack/react-query';

const monthLabel = (month: string) => `${Number(month.slice(5))}월`;

function Amount({ value }: { value: number | null }) {
  return <>{won(value)}</>;
}

function StudentRow({ row }: { row: StudentCumulativeRow }) {
  const categories = row.categories.filter((item) =>
    (item.billed ?? 0) !== 0 || (item.collected ?? 0) !== 0 || (item.receivable ?? 0) !== 0);
  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-fg">
            {row.studentName} <span className="font-normal text-fg-subtle">{row.studentTag}</span>
          </h3>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            등록 {row.registeredOn} · 집계 {row.periodFrom} ~ {row.periodTo}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label={`${row.studentName} 누적 요약`}>
          <Chip tone="neutral">누적 매출 <Amount value={row.totalBilled} /></Chip>
          <Chip tone="success">수납 <Amount value={row.totalCollected} /></Chip>
          <Chip tone={row.receivable && row.receivable > 0 ? 'danger' : 'neutral'}>미수 <Amount value={row.receivable} /></Chip>
          <Chip tone="info">월평균 매출 <Amount value={row.monthlyAverageBilled} /></Chip>
        </div>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label={`${row.studentName} 최근 3개월`}>
        {row.months.map((item) => (
          <div key={item.month} className="rounded-lg border border-line bg-inset px-3 py-2">
            <p className="text-[12px] font-bold text-fg">{monthLabel(item.month)}</p>
            <dl className="mt-1 grid grid-cols-2 gap-2 text-[12px]">
              <div><dt className="text-fg-subtle">매출</dt><dd className="font-bold text-fg"><Amount value={item.billed} /></dd></div>
              <div><dt className="text-fg-subtle">수납</dt><dd className="font-bold text-green"><Amount value={item.collected} /></dd></div>
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="min-w-[620px] w-full border-collapse text-[12px]">
          <thead className="bg-inset text-fg-subtle">
            <tr>
              <th className="border-b border-line px-3 py-2 text-left">분류</th>
              <th className="border-b border-line px-3 py-2 text-right">누적 매출</th>
              <th className="border-b border-line px-3 py-2 text-right">수납</th>
              <th className="border-b border-line px-3 py-2 text-right">미수채권</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((item) => (
              <tr key={item.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium text-fg">{item.label}</td>
                <td className="px-3 py-2 text-right text-fg"><Amount value={item.billed} /></td>
                <td className="px-3 py-2 text-right text-fg"><Amount value={item.collected} /></td>
                <td className="px-3 py-2 text-right font-bold text-fg"><Amount value={item.receivable} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function StudentCumulativeLedger({ query }: { query: UseQueryResult<StudentCumulative> }) {
  return (
    <Panel title="학생별 누적 원장" sub="최근 3개월 월별 매출·수납과 전체 누적·미수채권을 서버 원장에서 읽습니다">
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} empty="유효 청구 또는 입금이 있는 학생이 없습니다.">
        {(data) => (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-fg-subtle">
              <span>학생 {data.items.length}명 · 기준일 {data.asOf}</span>
              <span>월평균은 {data.recentMonths.map(monthLabel).join(' · ')} 매출 합을 3으로 나눈 값입니다.</span>
            </div>
            {data.items.map((row) => <StudentRow key={row.studentId} row={row} />)}
          </div>
        )}
      </QueryState>
    </Panel>
  );
}
