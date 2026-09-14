/** @file-guide
 * 목적: GpaPointCard.tsx — GpaPointCard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §82 「학생별 포인트」 카드 한 장 — C86-c.
 *
 * 컷의 카드는 넉 줄이다: **이름 + 「12p 남음」/「2p 초과」 칩** · **담당 · 배정 Np** ·
 * 막대 · **서비스 칩들**(또는 「사용 없음」).
 *
 * 이 파일은 C34 부터 있었지만 **아무 화면도 쓰지 않았다** — 게다가 컷과 달라서(담당·배정 줄이
 * 없고 서비스 칩도 없었다) 그대로 꽂을 수도 없었다. 컷에 맞추고 §82 에 꽂는다.
 *
 * **세는 일은 하나도 하지 않는다.** 남은 값·초과 여부·서비스별 회수와 합계는 전부 서버가 준다
 * (D-R37 · N-19 — 카드와 머리가 따로 세면 두 수가 갈린다).
 */
import type { ReactNode } from 'react';
import type { GpaStudent } from '@/api/types';
import { Chip, LevelBar } from '../ui';
import { cn } from '../ui/cn';

export function GpaPointCard({ s, action, className }: {
  s: GpaStudent;
  /** 제품이 더한 것 — 컷에는 없다. 배정을 고치는 자리는 §82 가 화면이라 여기뿐이다 */
  action?: ReactNode;
  className?: string;
}) {
  // 「임박」은 판정이 아니라 **눈길**이다 — 서버의 over 만 업무 판정이다
  const low = !s.over && s.alloc > 0 && s.remain <= s.alloc * 0.15;
  return (
    <div className={cn(
      'rounded-xl border p-3.5',
      s.over ? 'border-red/40 bg-red/5' : low ? 'border-amber/40 bg-card' : 'border-line bg-card',
      className,
    )}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 grow truncate text-[13px] font-bold text-fg">
          {s.name}
          {s.grade ? <span className="ml-1 text-[11px] font-normal text-fg-subtle">{s.grade}</span> : null}
        </span>
        <Chip size="compact" tone={s.over ? 'danger' : low ? 'warning' : 'success'}>
          {s.over ? `${-s.remain}p 초과` : `${s.remain}p 남음`}
        </Chip>
      </div>

      <p className="mt-0.5 text-[11.5px] text-fg-subtle">
        {s.coordName ?? '—'} · 배정 {s.alloc}p
      </p>

      <LevelBar
        className="mt-2"
        value={s.alloc ? (s.used + s.wait) / s.alloc : 1}
        tone={s.over ? 'red' : low ? 'amber' : 'green'}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {s.svcs.length === 0
          ? <Chip size="compact" tone="neutral">사용 없음</Chip>
          : s.svcs.map((v) => (
            <Chip key={v.key} size="compact" tone={s.over ? 'danger' : 'info'}>
              {v.name} {v.count}·{v.points}p
            </Chip>
          ))}
      </div>

      {s.over ? (
        <p className="mt-1.5 text-[10.5px] text-red">추가 결제 또는 다음 사이클 조정이 필요합니다</p>
      ) : null}

      {action ? <div className="mt-2 border-t border-line pt-2">{action}</div> : null}
    </div>
  );
}
