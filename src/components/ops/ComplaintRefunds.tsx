/** @file-guide
 * 목적: ComplaintRefunds.tsx — ComplaintRefunds (component) · 한 컴플레인에서 연 수강 종료 · 환불 이력 줄.
 * 책임/재사용: §67 처리 창(ComplaintDetail)과 「이력」 표의 펼친 줄(PDF J-102)이 같은 줄을 쓴다. 금액은 서버 값 그대로(권한이 없으면 null · D-R39).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { Chip } from '../ui';
import type { Complaint } from '@/api/types';
import { won } from '@/lib/money';

/**
 * J-99 · N-135 — 이 컴플레인에서 연 수강 종료 · 환불. 없으면 아무것도 그리지 않는다.
 * `?? []` 는 배포 사이(새 화면 · 옛 서버)에 깨지지 않게 하는 방어다 — 계약에서는 늘 배열이다.
 */
export function ComplaintRefunds({ refunds }: { refunds: Complaint['refunds'] | undefined }) {
  const rows = refunds ?? [];
  if (!rows.length) return null;
  return (
    <section aria-label="환불 이력" className="rounded-lg border border-line bg-bg-2 p-3">
      <h3 className="mb-1.5 text-[12px] font-bold text-fg">환불 이력</h3>
      <ul className="flex flex-col gap-1 text-[12px]">
        {rows.map((r, i) => (
          <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-2">
            <Chip tone="warning">환불 {won(r.refundTotal)}</Chip>
            <span className="text-fg-2">{+r.endedOn.slice(5, 7)}/{+r.endedOn.slice(8, 10)}까지 수업</span>
            <span className="text-fg-subtle">{r.byName ?? '처리자 기록 없음'} · {r.at}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
