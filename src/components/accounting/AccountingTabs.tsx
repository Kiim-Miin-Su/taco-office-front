/** @file-guide
 * 목적: AccountingTabs.tsx — ACCOUNTING_TABS, AccountingTab, AccountingTabs (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 회계 탭 **두 층** — 원문 §52~§57 탭 줄 그대로 (대표 위임 채택 N-37 ① · W11).
 *
 * 윗줄은 돈의 흐름 넷(받을 돈 · 들어온 돈 · 나간 돈 · 정리 · 기준)이고, 고른 묶음 바로 옆에 그 아래 탭이 선다.
 * 원문 컷: 고른 묶음은 색 알약(받을 돈 파랑 · 들어온 돈 초록 · 나간 돈 보라) · 아래 탭은 흰 칩 · 고른 탭은 짙은 칩.
 * 「정리 · 기준」을 고른 모습은 컷에 없다 — 새 색을 짓지 않고 흐린 글자색 바탕으로 둔다.
 *
 * - 제품의 「입금 기록」·「들어온 돈」은 원문 「들어온 돈 › 입금 기록」 한 탭이다. 「강사료 정산」은 나간 돈, 「단가표」는 정리 · 기준.
 * - 기능이 없는 원문 아래 탭(영수증 · 세금계산서 · 학생별 누적)은 **누를 수 없게** 세우고 까닭을 단다.
 * - 원문 나간 돈의 아래 탭 넷(강사료 계산 · 강사료 지급 · 부대비용 · 법인카드)은 결정대로 둘(강사료 정산 · 지출)이다.
 * - 정리 · 기준의 「가산 규칙」(N-93 · W11 M2)은 강사료에 더하는 돈의 기준 표다 — 원문 §56 「추가로 드리는 돈」을 고치는 자리.
 *   탭 줄 오른쪽 두 비공개 스위치(N-94)는 페이지가 「+ 청구서」 옆에 세운다(`AcctPrivacySwitches`).
 * - 묶음 옆 동그라미 수(원문 「3」 · 「2」)는 무엇을 세는지 원문에 산식이 없어 짓지 않았다.
 *
 * 서버 계약은 그대로다 — 배치만 바뀐다. 탭 값은 `?tab=` 값과 1:1 이다(페이지가 복원한다).
 */
'use client';
import { cn } from '@/components/ui';

export const ACCOUNTING_TABS = ['board', 'inv', 'tuition', 'other', 'record', 'unpaid', 'payout', 'out', 'close', 'rates', 'wage', 'bonus'] as const;
export type AccountingTab = (typeof ACCOUNTING_TABS)[number];

interface SubTab { value?: AccountingTab; label: string; disabledReason?: string }
interface Group { key: string; label: string; tone: string; first: AccountingTab; tabs: readonly SubTab[] }

/** 묶음과 아래 탭 — 이름 · 차례는 원문 탭 줄이다. 알약 바탕은 토큰 클래스 (D-R41) */
const GROUPS: readonly Group[] = [
  {
    // 처음 여는 자리는 원문대로 트래킹 보드다(C-08 — 「보드 질의 1건 절약」 까닭이 사라져 리드 결정으로 되돌렸다 · W11 A' 후속)
    key: 'recv', label: '받을 돈', tone: 'bg-blue', first: 'board',
    tabs: [
      { value: 'board', label: '트래킹 보드' },
      { value: 'inv', label: '청구서' },
      { value: 'tuition', label: '수업료 계산' },
      { value: 'other', label: '그 밖의 수입' },
    ],
  },
  {
    key: 'in', label: '들어온 돈', tone: 'bg-green', first: 'record',
    tabs: [
      { value: 'record', label: '입금 기록' },
      { label: '영수증 · 세금계산서', disabledReason: '아직 없는 기능입니다 — 무엇을 어떻게 발행할지 정해지지 않았습니다' },
      { value: 'unpaid', label: '못 받은 돈' },
      { label: '학생별 누적', disabledReason: '아직 없는 기능입니다 — 무엇을 모아 보일지 정해지지 않았습니다' },
    ],
  },
  {
    key: 'out', label: '나간 돈', tone: 'bg-violet', first: 'payout',
    tabs: [
      { value: 'payout', label: '강사료 정산' },
      { value: 'out', label: '지출' },
    ],
  },
  {
    key: 'std', label: '정리 · 기준', tone: 'bg-fg-subtle', first: 'close',
    tabs: [
      { value: 'close', label: '월 마감' },
      { value: 'rates', label: '단가표' },
      { value: 'wage', label: '시급' },
      { value: 'bonus', label: '가산 규칙' },
    ],
  },
];

export function AccountingTabs({ value, onChange }: { value: AccountingTab; onChange: (tab: AccountingTab) => void }) {
  return (
    <div role="group" aria-label="회계 탭" className="flex flex-wrap items-center gap-1">
      {GROUPS.map((g) => {
        const on = g.tabs.some((t) => t.value === value);
        return (
          <div key={g.key} className={cn('flex flex-wrap items-center gap-1', on ? 'rounded-xl border border-line bg-card p-1' : '')}>
            <button
              type="button" aria-pressed={on} onClick={() => onChange(g.first)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors',
                on ? cn(g.tone, 'text-white') : 'text-fg-subtle hover:text-fg-2',
              )}
            >
              {g.label}
            </button>
            {on ? g.tabs.map((t) => {
              const picked = t.value === value;
              return (
                <button
                  key={t.label} type="button"
                  aria-pressed={t.value ? picked : undefined}
                  disabled={!t.value}
                  title={t.disabledReason}
                  onClick={() => { if (t.value) onChange(t.value); }}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    picked ? 'border-header bg-header text-card' : 'border-line bg-card text-fg-2 hover:border-fg-subtle',
                  )}
                >
                  {t.label}
                </button>
              );
            }) : null}
          </div>
        );
      })}
    </div>
  );
}
