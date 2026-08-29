/**
 * Data/Settlement Line — 정산 명세 (item · bonus · cut · total · tax).
 * 「왜 이 금액인가」를 강사가 직접 검산할 수 있어야 한다.
 */
import { cn } from '../ui/cn';

export type LineType = 'item' | 'bonus' | 'cut' | 'sub' | 'tax' | 'total';

export interface SettlementLine {
  type: LineType;
  label: string;
  detail?: string;
  amount: number | null;
}

const won = (v: number | null) => (v === null ? '가려짐' : `${v.toLocaleString('ko-KR')}원`);

export function SettlementLines({ lines }: { lines: SettlementLine[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l, i) => {
        const total = l.type === 'total';
        const cut = l.type === 'cut' || l.type === 'tax';
        return (
          <div
            key={`${l.label}-${i}`}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5',
              total ? 'bg-fg text-white' : l.type === 'sub' ? 'bg-inset' : 'border border-line bg-card',
            )}
          >
            <div className="min-w-0">
              <div className={cn('text-[12px] font-bold', total ? 'text-white' : cut ? 'text-red' : 'text-fg')}>
                {l.label}
              </div>
              {l.detail ? (
                <div className={cn('mt-0.5 text-[10.5px]', total ? 'text-line-2' : cut ? 'text-red' : 'text-fg-subtle')}>
                  {l.detail}
                </div>
              ) : null}
            </div>
            <div className={cn(
              'shrink-0 font-bold',
              total ? 'text-[16px] text-white' : cut ? 'text-[12.5px] text-red' : 'text-[12.5px] text-fg',
            )}>
              {cut && l.amount !== null && l.amount > 0 ? `-${won(l.amount)}` : won(l.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
