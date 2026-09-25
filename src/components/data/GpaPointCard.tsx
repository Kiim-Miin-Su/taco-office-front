/** @file-guide
 * 목적: GpaPointCard.tsx — GpaPointCard, gpaSvcTone, GPA_SVC_DOT (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §82 「학생별 포인트」 카드 한 장 — C86-c.
 *
 * 컷의 카드는 넉 줄이다: **이름 + 「12p 남음」/「2p 초과」 칩** · **담당 · 배정 Np** ·
 * 막대 · **서비스 칩들**(또는 「사용 없음」).
 *
 * **카드를 누르면 그 학생이 골라진다**(82-4) — 원본은 고른 카드를 갈색 테두리·옅은 바탕으로 보이고
 * 아래 상세가 그 학생이 된다. 그래서 카드 자체가 단추(`aria-pressed`)다. 배정을 고치는 줄은 카드 **밖**에 둔다 —
 * 단추 안에 입력칸을 넣을 수 없다.
 *
 * **세는 일은 하나도 하지 않는다.** 남은 값·초과 여부·서비스별 회수와 합계는 전부 서버가 준다
 * (D-R37 · N-19 — 카드와 머리가 따로 세면 두 수가 갈린다).
 */
import type { GpaStudent } from '@/api/types';
import { Chip, type ChipTone } from '../ui';
import { cn } from '../ui/cn';

/**
 * 서비스 색 — **표시 전용**이다(원본 §82: 숙제 지원 청록 · 프로젝트 피드백 보라 · Quiz 대비 주황 · Test 대비 빨강 ·
 * 자습 지원 청록). 규정 줄 칩 · 카드 칩 · 회차 내역 점이 **이 한 표**를 나눠 쓴다(82-2 · 82-5).
 * 청록·주황은 전용 토큰(`teal`·`orange`)이다 — 예전에 빌려 쓰던 파랑·초록·호박을 컷 색으로 돌려놓았다(D-R41 · D-R44).
 */
const GPA_SVC_TONE: Record<string, ChipTone> = {
  hw: 'teal', prj: 'purple', quiz: 'orange', test: 'danger', self: 'teal',
};
export const gpaSvcTone = (key: string): ChipTone => GPA_SVC_TONE[key] ?? 'neutral';

/** 회차 내역 표의 색 점 — 같은 빛깔을 점으로 (원본 §82 「■ 숙제 지원」) */
export const GPA_SVC_DOT: Record<ChipTone, string> = {
  info: 'bg-blue', purple: 'bg-violet', warning: 'bg-amber', danger: 'bg-red', success: 'bg-green', neutral: 'bg-fg-subtle',
  teal: 'bg-teal', orange: 'bg-orange',
};

export function GpaPointCard({ s, selected = false, onSelect, className }: {
  s: GpaStudent;
  /** 이 학생이 골라져 아래 상세가 이 학생인가 */
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  // 막대는 **쓴 비율**이다(원본 §82 의 갈색 막대) — 승인 대기도 이미 잔여에서 빠졌으므로 함께 센다. 넘으면 가득 찬다
  const ratio = s.alloc > 0 ? Math.min(1, (s.used + s.wait) / s.alloc) : (s.used + s.wait > 0 ? 1 : 0);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'block w-full rounded-xl border p-3.5 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : s.over ? 'border-red/40 bg-red/5' : 'border-line bg-card',
        onSelect ? 'hover:border-primary/60' : '',
        className,
      )}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 grow truncate text-[13px] font-bold text-fg">
          {s.name}
          {s.grade ? <span className="ml-1 text-[11px] font-normal text-fg-subtle">{s.grade}</span> : null}
        </span>
        <Chip size="compact" tone={s.over ? 'danger' : 'success'} styleKind={s.over ? 'solid' : 'soft'}>
          {s.over ? `${-s.remain}p 초과` : `${s.remain}p 남음`}
        </Chip>
      </span>

      <span className="mt-0.5 block text-[11.5px] text-fg-subtle">
        {s.coordName ?? '—'} · 배정 {s.alloc}p
      </span>

      <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>

      <span className="mt-2 flex flex-wrap items-center gap-1">
        {s.svcs.length === 0
          ? <Chip size="compact" tone="neutral">사용 없음</Chip>
          : s.svcs.map((v) => (
            <Chip key={v.key} size="compact" tone={gpaSvcTone(v.key)}>
              {v.name} {v.count}·{v.points}p
            </Chip>
          ))}
      </span>

      {s.over ? (
        <span className="mt-1.5 block text-[10.5px] text-red">추가 결제 또는 다음 사이클 조정이 필요합니다</span>
      ) : null}
    </button>
  );
}
