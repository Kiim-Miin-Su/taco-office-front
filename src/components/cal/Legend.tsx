/**
 * Cal/Legend Group — 범례를 화면 안에 둔다. 사용자 교육이 따로 필요 없게.
 * 채널을 섞지 않는다 (V26 §2.3): 색 · 테두리 · 빗금이 각각 다른 것을 말한다.
 */
import { Chip } from '../ui';
import { STATUS_LOOK, STATUS_LABEL } from './EventBlock';

// 색은 EventBlock 이 갖는다 — 범례는 **그 표를 읽기만** 한다

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">색 = 리포트를 썼는가</span>
        {STATUS_LABEL.map(([key, label]) => (
          <span key={key} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_LOOK[key]}`}>{label}</span>
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
