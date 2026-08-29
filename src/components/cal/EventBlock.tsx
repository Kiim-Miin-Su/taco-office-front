/**
 * Cal/Event Block — Figma `Cal/Event Block` (status 7 × mode 2 = 14 변형).
 *
 * 채널을 섞지 않는다 (V26 §2.3 · 명세서 §07):
 *   색     = 리포트를 썼는가
 *   테두리 = 어디서 하는가 (실선 대면 / 점선 줌)
 *   빗금   = 취소
 * 한 채널에 두 뜻을 실으면 읽을 수 없게 된다.
 */
import { cn } from '../ui/cn';
import type { Occurrence } from '@/api/types';

const STATUS: Record<string, string> = {
  na: 'bg-inset text-fg-2 border-line',
  plan: 'bg-blue/10 text-blue border-blue/35',
  none: 'bg-red/10 text-red border-red/40',
  draft: 'bg-amber/10 text-amber border-amber/40',
  wait: 'bg-amber/10 text-amber border-amber/45',
  ok: 'bg-green/10 text-green border-green/40',
  rej: 'bg-violet/10 text-violet border-violet/40',
};

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface EventBlockProps {
  occ: Occurrence;
  subName?: string;
  compact?: boolean;
  onClick?: () => void;
}

export function EventBlock({ occ, subName, compact, onClick }: EventBlockProps) {
  const look = STATUS[occ.repState] ?? STATUS.na;
  const names = occ.students.map((s) => s.name).join(' · ');
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${subName ?? occ.kindKey}${names ? ` · ${names}` : ''}`}
      className={cn(
        'w-full rounded-md border px-2 py-1 text-left transition-shadow hover:shadow-sm',
        // 점선 = 비대면. 모양이 아니라 테두리로만 말한다.
        occ.mode === 'online' ? 'border-dashed' : 'border-solid',
        occ.canceled && 'opacity-45 line-through',
        look,
      )}
    >
      <div className="flex items-center gap-1 text-[11px] font-bold leading-tight">
        <span>{hhmm(occ.startMin)}</span>
        <span className="truncate">{subName ?? occ.title ?? occ.kindKey}</span>
      </div>
      {!compact && names ? (
        <div className="mt-0.5 truncate text-[10px] opacity-80">{names}</div>
      ) : null}
      {!compact && occ.hasException ? (
        <div className="mt-0.5 text-[10px] font-bold opacity-90">예외 있음</div>
      ) : null}
    </button>
  );
}
