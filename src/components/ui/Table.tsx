/**
 * 표 — Figma 의 `Data/List Row` 를 표 한 벌로 묶은 것.
 * 화면마다 <table> 을 새로 그리면 줄 높이와 테두리가 조금씩 달라진다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  head: ReactNode;
  width?: number;
  align?: 'left' | 'right' | 'center';
  cell: (row: T, index: number) => ReactNode;
}

export interface TableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  className?: string;
}

export function Table<T>({ columns, rows, rowKey, onRowClick, empty, className }: TableProps<T>) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-card', className)}>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-inset">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  'border-b border-line px-3 py-2 text-[11px] font-bold text-fg-subtle',
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                )}
              >
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-fg-subtle">
                {empty ?? '없습니다'}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-inset')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2.5 align-middle text-fg',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    )}
                  >
                    {c.cell(r, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
