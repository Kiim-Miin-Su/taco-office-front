/** @file-guide
 * 목적: ZoomGrid.tsx — ZoomGrid (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §21 의 **계정 × 시간 격자**.
 *
 * 서랍(§21)과 「줌 계정 관리」가 **같은 그림**을 그린다. 전에는 격자가 관리 화면에만 있었고
 * 서랍은 계정 카드 목록이었다 — 같은 것을 두 모양으로 그리면 한쪽만 고쳐진다.
 *
 * 칸의 뜻은 **서버가 센 `busy`** 다. 화면은 0 인지 아닌지만 본다 — 겹침 판정도 정원도 여기서 하지 않는다
 * (D-R37 · D-R39). 색은 토큰에서 꺼낸다 (D-R41).
 */
import type { ZoomBoard } from '@/api/types';

const hh = (h: number) => String(h).padStart(2, '0');

export function ZoomGrid({ board, compact = false }: { board: ZoomBoard; compact?: boolean }) {
  if (board.rows.length === 0) {
    return <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">켜진 계정이 없습니다.</p>;
  }
  const cell = compact ? 'h-4' : 'h-5';
  return (
    <div className="overflow-x-auto">
      <table className={compact ? 'text-[11px]' : 'text-[12px]'}>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-bold">계정</th>
            {board.rows[0].slots.map((s) => (
              <th
                key={s.hour}
                className={`${compact ? 'w-7' : 'w-9'} px-0 py-1 text-center font-normal ${
                  s.hour === board.nowHour ? 'font-bold text-fg' : 'text-fg-subtle'
                }`}
              >
                {hh(s.hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r) => (
            <tr key={r.zaccId}>
              <td className="whitespace-nowrap px-2 py-1 font-bold">{r.label}</td>
              {r.slots.map((s) => (
                <td key={s.hour} className="px-0.5 py-1">
                  {/* 빈 칸은 「쓸 수 있다」는 뜻이다 — 원문의 연초록. 찬 칸은 붉다 (D-R41) */}
                  <div
                    className={`${cell} rounded ${
                      s.busy > 0 ? 'bg-red/70' : 'border border-green/30 bg-green/15'
                    }`}
                    title={`${hh(s.hour)}시 · ${s.busy}건`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
