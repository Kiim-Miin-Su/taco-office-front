/** @file-guide
 * 목적: MyExpenses.tsx — MyExpenses (component · 서랍 「변경 요청 · 이력」 칸 아래의 「내 지출 신청」)
 * 책임/재사용: 기존 ExpenseCreateButton(POST /accounting/expenses)과 useMyExpenses(GET /accounting/expenses/mine)를 재사용한다. 건수는 서버 값만 그린다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * N-52 채택(W11) — 서랍(요청함)에 「+ 지출 신청」과 「내 지출 신청」 목록.
 *
 * 서랍에서 직원이 **자기가 올린 것**을 보는 칸은 「변경 요청 · 이력」이라 그 아래에 둔다(새 칸을 만들지 않는다).
 * 입력은 회계 탭과 **같은 창**(`ExpenseCreateButton`)이고 서버는 언제나 심사 대기로 넣는다. 목록은 본인 것만 주는 경로이고,
 * 머리의 건수는 서랍 한 번 읽기(`DrawerDto.myExpenses`)가 센 값이다 — 화면이 세지 않는다(D-R37).
 */
'use client';
import { useMyExpenses } from '@/api/queries';
import type { Drawer as DrawerData, Expense } from '@/api/types';
import { ExpenseCreateButton } from '@/components/accounting/ExpenseForm';
import { Banner, Chip, type Tone } from '@/components/ui';
import { won } from '@/lib/money';

/** 심사 상태 낱말 — 심사 화면(§56)이 쓰는 「심사 · 승인 · 반려」 그대로 */
const STATE: Record<Expense['state'], { label: string; tone: Tone }> = {
  pending: { label: '심사 대기', tone: 'info' },
  approved: { label: '승인', tone: 'success' },
  rejected: { label: '반려', tone: 'danger' },
};

export function MyExpenses({ summary, enabled }: { summary: DrawerData['myExpenses']; enabled: boolean }) {
  const q = useMyExpenses(enabled);
  const items = q.data?.items ?? [];
  return (
    <section aria-label="내 지출 신청" className="mt-6 border-t border-line pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-bold text-fg">내 지출 신청</h3>
        <span className="text-[11.5px] text-fg-subtle">심사 대기 {summary.pending} · 반려 {summary.rejected}</span>
        <span className="ml-auto">
          {q.data ? <ExpenseCreateButton categories={q.data.categories} verb="신청" /> : null}
        </span>
      </div>
      {q.isLoading ? <p className="py-4 text-center text-[12px] text-fg-subtle">읽는 중…</p> : null}
      {q.isError ? <Banner tone="danger">내 지출 신청을 읽지 못했습니다. 잠시 뒤 다시 열어 주세요.</Banner> : null}
      {q.data && items.length === 0 ? <p className="py-4 text-center text-[12px] text-fg-subtle">올린 지출 신청이 없습니다</p> : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((e) => (
            <li key={e.id} className="rounded-lg border border-line bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="tabular-nums text-fg-subtle">{e.spendOn}</span>
                <Chip size="compact" tone="neutral">{e.categoryLabel}</Chip>
                <span className="min-w-0 grow truncate font-bold text-fg">{e.merchant ?? e.purpose ?? '—'}</span>
                <span className="tabular-nums text-fg-2">
                  {e.requestedAmount === null ? '—' : won(e.requestedAmount)}
                  {e.state === 'approved' && e.amount !== null && e.amount !== e.requestedAmount ? ` → ${won(e.amount)}` : ''}
                </span>
                <Chip size="compact" tone={STATE[e.state].tone}>{STATE[e.state].label}</Chip>
              </div>
              {e.state !== 'pending' && e.reason ? <p className="mt-1 text-[11.5px] text-fg-2">사유 — {e.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
