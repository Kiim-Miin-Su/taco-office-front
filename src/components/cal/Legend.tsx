/**
 * Cal/Legend Group — 범례를 화면 안에 둔다. 사용자 교육이 따로 필요 없게.
 * 채널을 섞지 않는다 (V26 §2.3): 색 · 테두리 · 빗금이 각각 다른 것을 말한다.
 */
import { Chip } from '../ui';

const COLOR = [
  { label: '안 씀', cls: 'bg-red/10 border-red/40 text-red' },
  { label: '예정', cls: 'bg-blue/10 border-blue/35 text-blue' },
  { label: '승인 대기', cls: 'bg-amber/10 border-amber/45 text-amber' },
  { label: '승인', cls: 'bg-green/10 border-green/40 text-green' },
  { label: '반려', cls: 'bg-violet/10 border-violet/40 text-violet' },
];

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">색 = 리포트를 썼는가</span>
        {COLOR.map((c) => (
          <span key={c.label} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">테두리 = 어디서</span>
        <span className="rounded border border-solid border-fg-subtle px-1.5 py-0.5 text-[10px]">대면</span>
        <span className="rounded border border-dashed border-fg-subtle px-1.5 py-0.5 text-[10px]">줌</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">취소</span>
        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] line-through opacity-45">취소된 수업</span>
      </div>
      <Chip tone="info">학생 이름은 블록에만 — 좁으면 글자가 깨진다</Chip>
    </div>
  );
}
