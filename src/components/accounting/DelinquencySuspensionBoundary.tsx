/** @file-guide
 * 목적: 최종 관리자 수정사항 p107·p113과 Figma A25의 연체 수강 정지·해제를 생성 계약 전 Front 경계로 제공한다. (component)
 * 책임/재사용: 기존 InvoiceDto의 서버 연체일·미수값만 재사용하며 후보 판정 정본, 연락처·수업 영향, 독촉·정지·해제 이력을 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useMemo, useState } from 'react';
import type { Invoice } from '@/api/types';
import { Banner, Button, Chip, FieldError, Input, Label, Panel, Table, type Column } from '@/components/ui';
import { won } from '@/lib/money';

interface SuspensionCandidate {
  studentId: number;
  studentName: string;
  studentTag: string | null;
  overdueDays: number;
  unpaid: number | null;
  invoiceCount: number;
}

const REQUIRED_CONTRACT = [
  '후보 판정 · threshold version',
  '영향 수업 · 신규 배정 차단',
  '정지 · 해제 version',
  'actual actor · 이력 · 알림',
] as const;

function candidatesOf(invoices: readonly Invoice[], threshold: number): SuspensionCandidate[] {
  const byStudent = new Map<number, SuspensionCandidate>();
  for (const invoice of invoices) {
    // overdueDays와 remaining은 서버 판정값이다. 화면은 날짜를 다시 빼거나 paid 상태를 재구성하지 않는다.
    if (invoice.overdueDays <= 0 || invoice.remaining === 0) continue;
    const current = byStudent.get(invoice.studentId);
    if (!current) {
      byStudent.set(invoice.studentId, {
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        studentTag: invoice.studentTag,
        overdueDays: invoice.overdueDays,
        unpaid: invoice.remaining,
        invoiceCount: 1,
      });
      continue;
    }
    current.overdueDays = Math.max(current.overdueDays, invoice.overdueDays);
    current.invoiceCount += 1;
    current.unpaid = current.unpaid === null || invoice.remaining === null ? null : current.unpaid + invoice.remaining;
  }
  return [...byStudent.values()]
    .filter((candidate) => candidate.overdueDays >= threshold)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.studentName.localeCompare(b.studentName, 'ko'));
}

export function DelinquencySuspensionBoundary({ invoices }: { invoices: readonly Invoice[] }) {
  const id = useId();
  const [thresholdText, setThresholdText] = useState('14');
  const thresholdNumber = Number(thresholdText);
  const thresholdError = !Number.isInteger(thresholdNumber) || thresholdNumber < 1 || thresholdNumber > 365;
  const threshold = thresholdError ? 14 : thresholdNumber;
  const candidates = useMemo(() => candidatesOf(invoices, threshold), [invoices, threshold]);

  const columns: Array<Column<SuspensionCandidate>> = [
    {
      key: 'student', head: '학생', width: 130,
      cell: (candidate) => (
        <span className="font-bold">{candidate.studentName}{candidate.studentTag ? <span className="ml-1 font-normal text-fg-subtle">{candidate.studentTag}</span> : null}</span>
      ),
    },
    { key: 'overdue', head: '연체', width: 90, cell: (candidate) => <span className="font-bold text-red">{candidate.overdueDays}일 연체</span> },
    { key: 'unpaid', head: '미수', width: 120, align: 'right', cell: (candidate) => <span className="font-bold">{won(candidate.unpaid)}</span> },
    { key: 'count', head: '건수', width: 60, align: 'center', cell: (candidate) => `${candidate.invoiceCount}건` },
    { key: 'contact', head: '연락처', width: 110, cell: () => <span className="text-fg-subtle">계약 대기</span> },
    { key: 'lessons', head: '수업', width: 100, cell: () => <span className="text-fg-subtle">계약 대기</span> },
    { key: 'state', head: '상태', width: 90, cell: () => <Chip tone="warning">보류 대상</Chip> },
    {
      key: 'actions', head: '', width: 240, align: 'right',
      cell: () => (
        <span className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="secondary" disabled title="학부모 채널과 독촉 이력 DTO가 필요합니다">납입 독촉 계약 준비 중</Button>
          <Button size="sm" disabled title="정지 영향 회차와 versioned writer가 필요합니다">수강 정지 계약 준비 중</Button>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <Panel>
          <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1"><Chip tone="warning">생성 계약 대기</Chip></div>
              <h2 className="text-[15px] font-bold text-fg">연체 수강 정지 · 해제</h2>
              <p className="mt-1 text-[12px] text-fg-subtle">현재 조회값에서 보류 기준을 넘은 학생 {candidates.length}명</p>
            </div>
            <Button size="sm" variant="secondary" disabled title="연락처 선택과 일괄 독촉 이력 계약이 필요합니다">전부 독촉 계약 준비 중</Button>
          </header>

          <Banner tone="warning" className="mb-4">
            현재 표는 <b>InvoiceDto가 이미 판정한 연체일과 미수 금액</b>으로 만든 Front 검토 초안입니다. 후보 정본·연락처·수업·정지 상태는 전용 조회 DTO가 생길 때 서버 값으로 교체합니다.
          </Banner>

          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-inset p-3">
            <div className="w-40">
              <Label htmlFor={`${id}-threshold`} hint="1~365일">보류 기준 일</Label>
              <Input id={`${id}-threshold`} type="number" min={1} max={365} step={1} inputMode="numeric"
                value={thresholdText} error={thresholdError} aria-invalid={thresholdError}
                onChange={(event) => setThresholdText(event.target.value)} />
              <FieldError>{thresholdError ? '1~365 사이의 정수로 적어 주세요' : undefined}</FieldError>
            </div>
            <span className="pb-2 text-[12px] text-fg-2">일 이상 연체한 학생을 검토합니다</span>
            <Button className="ml-auto" size="sm" disabled title="변경 권한과 효력일·version 계약이 필요합니다">기준 저장 계약 준비 중</Button>
          </div>

          {candidates.length === 0 ? (
            <p className="rounded-xl border border-line bg-card px-3 py-10 text-center text-[12px] text-fg-subtle">
              현재 조회값에서 기준을 넘은 학생이 없습니다
            </p>
          ) : (
            <>
              <div className="hidden lg:block" aria-label="수강 정지 후보 표">
                <Table columns={columns} rows={candidates} rowKey={(candidate) => candidate.studentId} />
              </div>
              <div className="flex flex-col gap-2 lg:hidden" aria-label="수강 정지 후보 카드">
                {candidates.map((candidate) => (
                  <article key={candidate.studentId} className="rounded-xl border border-line bg-card p-3">
                    <header className="flex items-start justify-between gap-2">
                      <b className="text-[13px] text-fg">{candidate.studentName}{candidate.studentTag ? <span className="ml-1 font-normal text-fg-subtle">{candidate.studentTag}</span> : null}</b>
                      <Chip tone="warning">보류 대상</Chip>
                    </header>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                      <div><dt className="text-fg-subtle">연체</dt><dd className="font-bold text-red">{candidate.overdueDays}일 연체</dd></div>
                      <div><dt className="text-fg-subtle">미수 · 건수</dt><dd className="font-bold text-fg">{won(candidate.unpaid)} · {candidate.invoiceCount}건</dd></div>
                      <div><dt className="text-fg-subtle">연락처</dt><dd className="text-fg-2">계약 대기</dd></div>
                      <div><dt className="text-fg-subtle">수업</dt><dd className="text-fg-2">계약 대기</dd></div>
                    </dl>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button size="sm" variant="secondary" disabled title="학부모 채널과 독촉 이력 DTO가 필요합니다">납입 독촉 계약 준비 중</Button>
                      <Button size="sm" disabled title="정지 영향 회차와 versioned writer가 필요합니다">수강 정지 계약 준비 중</Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel className="mt-4" title="수강 정지 계약" sub="후보 판정·독촉·정지·입금 확인·해제를 같은 version으로 재조회합니다">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="수강 정지 필요 필드">
            {REQUIRED_CONTRACT.map((field) => (
              <div key={field} className="rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">{field}</div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-fg-subtle">기존 학생 휴원 `stu_pause`를 그대로 쓰지 않습니다. 연체 사유·영향 회차·회계 상태를 구분하는 신규 계약 뒤에만 연결합니다.</p>
        </Panel>
      </div>

      <aside className="flex flex-col gap-3">
        <Panel title="수강 정지 효력" sub="정지 writer가 성공한 뒤 서버 재조회로 확인합니다">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[12px] text-fg-2">
            <li>시간표 수업 칸과 학생 컬럼에 연체 보류를 표시합니다.</li>
            <li><b>기존 일정은 유지하고 새 일정 저장만 차단</b>합니다.</li>
            <li>복사·이동·명단 추가 등 모든 신규 배정 경로를 같은 서버 guard로 막습니다.</li>
          </ul>
        </Panel>
        <Panel title="해제하면 즉시 원복" sub="입금 확인과 해제의 동시성 계약이 필요합니다">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[12px] text-fg-2">
            <li><b>입금 확인 뒤 해제하면 즉시 원복</b>하고 새 일정 차단을 풉니다.</li>
            <li>정지·해제는 actual actor, 시각, 사유, 알림과 함께 이력에 남깁니다.</li>
            <li>자동 해제 기준과 임계일 변경 권한은 정책 확정 전 적용하지 않습니다.</li>
          </ul>
        </Panel>
        <Panel title="보류 이력">
          <p className="text-[12px] text-fg-subtle">전용 이력 조회 계약이 아직 없습니다.</p>
        </Panel>
      </aside>
    </div>
  );
}
