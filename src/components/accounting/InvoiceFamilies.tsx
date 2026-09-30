/** @file-guide
 * 목적: InvoiceFamilies.tsx — 같은 달 · 같은 보호자 연락처로 묶인 형제 청구서를 한 줄로 보는 「형제 합산」 (테스트 시나리오 A-13).
 * 책임/재사용: 서버가 묶은 families(합계 포함)를 그리기만 한다. 청구서는 각각 그대로다 — 합산은 보기이고 청구 · 수납 모델을 바꾸지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import type { Accounting } from '@/api/types';
import { won } from '@/lib/money';

type Family = Accounting['families'][number];

/**
 * A-13 「청구서는 각각 나오거나 합산을 고를 수 있다」 — 사용자 결정 2026-09-30 「묶음 표시 + 합산 보기」.
 * 묶음 · 합계는 서버 값이다(lib/family · AccountingService.invoiceFamilies — 화면이 더하지 않는다 · D-R37). 금액을 못 보면 「—」.
 */
export function InvoiceFamilies({ families, onOpen }: { families: Family[]; onOpen?: (invId: number) => void }) {
  return (
    <section aria-label="형제 합산" className="mb-3 rounded-lg border border-line bg-card p-3">
      <p className="mb-2 text-[11.5px] text-fg-subtle">같은 달 · 같은 보호자 연락처로 묶인 형제의 청구서를 합쳐 봅니다. 청구서는 학생마다 그대로입니다.</p>
      {families.length === 0 ? <p className="text-[12px] text-fg-subtle">묶인 형제 청구서가 없습니다.</p> : (
        <ul className="flex flex-col gap-1.5">
          {families.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-inset px-3 py-2 text-[12px]">
              <b className="text-fg">{`${f.yearMonth} · ${f.students.map((s) => s.name).join(' · ')}`}</b>
              <span>{`청구서 ${f.invoiceIds.length}장`}</span>
              <span>{`합계 ${won(f.amount)}`}</span>
              <span className="text-fg-subtle">{`받은 돈 ${won(f.paidAmount)}`}</span>
              {onOpen ? (
                <span className="ml-auto flex gap-1">
                  {f.invoiceIds.map((id) => (
                    <button key={id} type="button" className="text-[11.5px] font-bold text-primary hover:underline" onClick={() => onOpen(id)}>
                      {`#${id} 열기`}
                    </button>
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
