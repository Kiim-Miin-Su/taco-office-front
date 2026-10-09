/** @file-guide
 * 목적: 최종 관리자 수정사항 p94·101·115와 Figma A22의 교재 판매·결제 수단 수수료 Front 화면을 제공한다. (component)
 * 책임/재사용: 기존 학생·교재 reader와 공용 UI를 재사용하고 생성 DTO 전에는 쓰기를 잠근다. 금액·권한·취소 가능 여부는 서버 결과만 표시한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useState } from 'react';
import { useMeta } from '@/api/queries';
import type { Books } from '@/api/types';
import { Banner, Button, Chip, Dialog, Drawer, FieldError, Input, Label, Panel, Select, Textarea } from '@/components/ui';
import { todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

const SUMMARY_FIELDS = ['건수', '금액 · 비중', '지급수수료', '순수납'] as const;
export type BookSalePaymentMethod = 'transfer' | 'cash';

/** 생성 DTO 전 Figma 상태를 시험하는 표시 projection. API 계층은 생성 DTO를 이 화면형으로 좁혀 넘긴다. */
export interface BookSaleListItemView {
  id: number;
  soldOn: string;
  studentName: string;
  studentTag: string | null;
  bookLabel: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentMethod: BookSalePaymentMethod;
  status: 'completed' | 'canceled';
  version: number;
  canCancel: boolean;
  createdBy: string;
  canceledBy: string | null;
  canceledReason: string | null;
}

export interface BookSaleMethodSummaryView {
  paymentMethod: BookSalePaymentMethod;
  count: number;
  amount: number;
  ratio: number;
  feeAmount: number;
  netAmount: number;
}

export interface BookSalesLedgerView {
  items: BookSaleListItemView[];
  totalCount: number;
  totalAmount: number;
  totalFeeAmount: number;
  totalNetAmount: number;
  methods: BookSaleMethodSummaryView[];
}

export interface BookSaleDraft {
  studentId: number;
  bookId: number;
  soldOn: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: BookSalePaymentMethod;
  memo: string | null;
}

const PAYMENT_METHOD_LABEL: Record<BookSalePaymentMethod, string> = { transfer: '계좌이체', cash: '현금' };
const emptyTouched = () => ({ student: false, book: false, date: false, quantity: false, price: false, payment: false });

export function BookSalesFeeBoundary({
  books,
  booksLoading,
  ledger,
  ledgerLoading = false,
  ledgerError = null,
  writeError = null,
  saving = false,
  canceling = false,
  onOpenPayments,
  onOpenBooks,
  onRetry,
  onCreate,
  onCancel,
}: {
  books: Books | undefined;
  booksLoading: boolean;
  ledger?: BookSalesLedgerView;
  ledgerLoading?: boolean;
  ledgerError?: string | null;
  writeError?: string | null;
  saving?: boolean;
  canceling?: boolean;
  onOpenPayments: () => void;
  onOpenBooks: () => void;
  onRetry?: () => void;
  onCreate?: (draft: BookSaleDraft) => void;
  onCancel?: (sale: BookSaleListItemView, reason: string) => void;
}) {
  const id = useId();
  const meta = useMeta();
  const [studentId, setStudentId] = useState('');
  const [bookId, setBookId] = useState('');
  const [soldOn, setSoldOn] = useState(todayKst());
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<BookSalePaymentMethod | ''>('');
  const [memo, setMemo] = useState('');
  const [touched, setTouched] = useState(emptyTouched);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const quantityNumber = Number(quantity);
  const priceNumber = Number(unitPrice);
  const studentError = touched.student && studentId === '';
  const bookError = touched.book && bookId === '';
  const dateError = touched.date && soldOn === '';
  const quantityError = touched.quantity && (!Number.isInteger(quantityNumber) || quantityNumber < 1);
  const priceError = touched.price && (!Number.isInteger(priceNumber) || priceNumber < 0);
  const paymentError = touched.payment && paymentMethod === '';
  const selected = ledger?.items.find((item) => item.id === selectedId) ?? null;
  const cancelTarget = ledger?.items.find((item) => item.id === cancelTargetId) ?? null;
  const invalid =
    studentId === '' ||
    bookId === '' ||
    soldOn === '' ||
    !Number.isInteger(quantityNumber) ||
    quantityNumber < 1 ||
    !Number.isInteger(priceNumber) ||
    priceNumber < 0 ||
    paymentMethod === '';

  const reset = () => {
    setStudentId('');
    setBookId('');
    setSoldOn(todayKst());
    setQuantity('1');
    setUnitPrice('');
    setPaymentMethod('');
    setMemo('');
    setTouched(emptyTouched());
  };

  const submit = () => {
    setTouched({ student: true, book: true, date: true, quantity: true, price: true, payment: true });
    if (invalid || !onCreate) {
      return;
    }
    onCreate({
      studentId: Number(studentId),
      bookId: Number(bookId),
      soldOn,
      quantity: quantityNumber,
      unitPrice: priceNumber,
      paymentMethod,
      memo: memo.trim() || null,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1">
              <Chip tone={onCreate ? 'success' : 'warning'}>{onCreate ? '판매 원장 연결됨' : '저장 연결 대기'}</Chip>
            </div>
            <h2 className="text-[15px] font-bold text-fg">교재 판매 · 결제 수수료</h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-fg-subtle">
              교재 카탈로그에서 판매 대상을 고르고, 청구서 없는 입금과 판매 원장을 한 거래로 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={onOpenPayments}>
              입금 기록 보기
            </Button>
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={onOpenBooks}>
              교재 목록 관리
            </Button>
          </div>
        </header>

        <Banner tone="warning" className="mb-4">
          수기 입금은 <b>교재 판매 원장을 대신하지 않습니다.</b> 판매 합계·수수료·순수납과 취소 가능 여부는 저장 후 서버가
          확정한 값만 표시합니다.
        </Banner>
        {writeError ? (
          <Banner tone="danger" className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{writeError} 입력값은 보존했습니다.</span>
              {onRetry ? (
                <Button size="sm" variant="ghost" onClick={onRetry}>
                  최신 판매 재조회
                </Button>
              ) : null}
            </div>
          </Banner>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="교재 판매 입력">
          <div>
            <Label htmlFor={`${id}-student`}>대상 학생</Label>
            <Select
              className="max-sm:h-11"
              id={`${id}-student`}
              value={studentId}
              error={studentError}
              aria-invalid={studentError}
              onBlur={() => setTouched((value) => ({ ...value, student: true }))}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">선택</option>
              {(meta.data?.students ?? []).map((student) => (
                <option key={student.id} value={student.id}>
                  {student.label}
                </option>
              ))}
            </Select>
            <FieldError>{studentError ? '학생을 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-book`}>판매 교재</Label>
            <Select
              className="max-sm:h-11"
              id={`${id}-book`}
              value={bookId}
              error={bookError}
              aria-invalid={bookError}
              disabled={booksLoading}
              onBlur={() => setTouched((value) => ({ ...value, book: true }))}
              onChange={(event) => setBookId(event.target.value)}
            >
              <option value="">{booksLoading ? '불러오는 중…' : '선택'}</option>
              {(books?.items ?? []).map((book) => (
                <option key={book.id} value={book.id}>
                  {book.code} · {book.title}
                  {book.edition ? ` · ${book.edition}` : ''}
                </option>
              ))}
            </Select>
            <FieldError>{bookError ? '교재를 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-sold-on`}>판매일</Label>
            <Input
              className="max-sm:h-11"
              id={`${id}-sold-on`}
              type="date"
              value={soldOn}
              error={dateError}
              aria-invalid={dateError}
              onBlur={() => setTouched((value) => ({ ...value, date: true }))}
              onChange={(event) => setSoldOn(event.target.value)}
            />
            <FieldError>{dateError ? '판매일을 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-quantity`}>수량</Label>
            <Input
              className="max-sm:h-11"
              id={`${id}-quantity`}
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={quantity}
              error={quantityError}
              aria-invalid={quantityError}
              onBlur={() => setTouched((value) => ({ ...value, quantity: true }))}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <FieldError>{quantityError ? '1권 이상의 정수를 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-unit-price`} hint="원">
              개당 판매가
            </Label>
            <Input
              className="max-sm:h-11"
              id={`${id}-unit-price`}
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={unitPrice}
              error={priceError}
              aria-invalid={priceError}
              onBlur={() => setTouched((value) => ({ ...value, price: true }))}
              onChange={(event) => setUnitPrice(event.target.value)}
              placeholder="예: 25000"
            />
            <FieldError>{priceError ? '0원 이상의 정수로 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-payment-method`}>결제 수단</Label>
            <Select
              className="max-sm:h-11"
              id={`${id}-payment-method`}
              value={paymentMethod}
              error={paymentError}
              aria-invalid={paymentError}
              onBlur={() => setTouched((value) => ({ ...value, payment: true }))}
              onChange={(event) => setPaymentMethod(event.target.value as BookSalePaymentMethod | '')}
            >
              <option value="">선택</option>
              <option value="transfer">계좌이체</option>
              <option value="cash">현금</option>
            </Select>
            <FieldError>{paymentError ? '결제 수단을 골라 주세요' : undefined}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-memo`} hint="선택">
              판매 메모
            </Label>
            <Textarea
              id={`${id}-memo`}
              value={memo}
              maxLength={500}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="할인·증빙에 필요한 메모"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-line-2 bg-inset px-3 py-3 text-[12px] font-medium text-fg-2 sm:grid-cols-3">
          <span>
            <b className="text-fg">판매 합계</b> · 서버 저장 후 표시
          </span>
          <span>
            <b className="text-fg">지급수수료</b> · 적용 기준
          </span>
          <span>
            <b className="text-fg">순수납</b> · 서버 저장 후 표시
          </span>
        </div>
        <div className="bg-card/95 sticky bottom-0 -mx-1 mt-3 flex flex-wrap justify-end gap-1.5 px-1 py-2 backdrop-blur-sm sm:static sm:bg-transparent sm:p-0">
          <Button className="max-sm:min-h-11" size="sm" variant="secondary" disabled={saving} onClick={reset}>
            초기화
          </Button>
          <Button
            className="max-sm:min-h-11"
            size="sm"
            disabled={!onCreate || saving}
            title={onCreate ? undefined : '판매 저장 기능이 연결된 뒤 사용할 수 있습니다'}
            onClick={submit}
          >
            {saving ? '판매 저장 중…' : onCreate ? '교재 판매 저장' : '교재 판매 저장 준비 중'}
          </Button>
        </div>
      </Panel>

      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1">
              <Chip tone={ledger ? 'info' : 'warning'}>{ledger ? '서버 원장' : '목록 계약 대기'}</Chip>
            </div>
            <h3 className="text-[15px] font-bold text-fg">판매 목록 · 결제 수단별 정산</h3>
            <p className="mt-1 text-[12px] text-fg-subtle">판매 원장과 거래 당시 적용 기준을 같은 조회 결과로 재확인합니다.</p>
          </div>
          {onRetry ? (
            <Button size="sm" variant="secondary" disabled={ledgerLoading} onClick={onRetry}>
              판매 목록 새로고침
            </Button>
          ) : null}
        </header>
        <Banner tone="neutral" className="mb-3">
          결제 수단, 수수료와 취소 가능 여부를 화면에서 다시 판정하지 않습니다. 강사에게는 이 원장과 액션을 제공하지 않습니다.
        </Banner>

        {ledgerLoading ? (
          <div
            role="status"
            aria-label="교재 판매 목록 불러오는 중"
            className="rounded-xl border border-line bg-inset p-6 text-center text-[12px] text-fg-subtle"
          >
            교재 판매 목록을 불러오는 중입니다.
          </div>
        ) : ledgerError ? (
          <div role="alert" className="rounded-xl border border-line bg-card p-6 text-center">
            <b className="text-[14px] text-fg">판매 목록을 불러오지 못했습니다</b>
            <p className="mt-1 text-[12px] text-fg-subtle">{ledgerError}</p>
            {onRetry ? (
              <Button className="mt-3" size="sm" onClick={onRetry}>
                다시 시도
              </Button>
            ) : null}
          </div>
        ) : !ledger ? (
          <div className="rounded-xl border border-dashed border-line-2 bg-inset p-6 text-center">
            <b className="text-[14px] text-fg">판매 원장 계약 연결 전입니다</b>
            <p className="mt-1 text-[12px] text-fg-subtle">
              판매 저장 기능을 연결하면 목록·상세·취소와 새로고침을 이 자리에 표시합니다.
            </p>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="region" aria-label="결제 수단별 집계">
              {[
                [SUMMARY_FIELDS[0], `${ledger.totalCount}건`],
                [SUMMARY_FIELDS[1], won(ledger.totalAmount)],
                [SUMMARY_FIELDS[2], won(ledger.totalFeeAmount)],
                [SUMMARY_FIELDS[3], won(ledger.totalNetAmount)],
              ].map(([field, value]) => (
                <div key={field} className="rounded-xl border border-line bg-inset p-3">
                  <div className="text-[12px] text-fg-subtle">{field}</div>
                  <b className="mt-1 block text-[16px] text-fg">{value}</b>
                </div>
              ))}
            </section>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ledger.methods.map((method) => (
                <div key={method.paymentMethod} className="rounded-xl border border-line bg-card p-3 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-fg">{PAYMENT_METHOD_LABEL[method.paymentMethod]}</b>
                    <Chip tone="info">{method.ratio.toFixed(1)}%</Chip>
                  </div>
                  <p className="mt-1 text-fg-2">
                    {method.count}건 · {won(method.amount)} · 수수료 {won(method.feeAmount)} · 순수납 {won(method.netAmount)}
                  </p>
                </div>
              ))}
            </div>

            {ledger.items.length === 0 ? (
              <div className="mt-3 rounded-xl border border-line bg-card p-8 text-center">
                <b className="text-[14px] text-fg">표시할 교재 판매가 없습니다</b>
                <p className="mt-1 text-[12px] text-fg-subtle">판매를 저장하면 서버 재조회 뒤 이 목록에 표시됩니다.</p>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[900px] border-collapse text-[12px]">
                  <thead className="bg-inset text-fg-subtle">
                    <tr>
                      <th className="border-b border-line px-3 py-2 text-left">판매일·학생</th>
                      <th className="border-b border-line px-3 py-2 text-left">교재</th>
                      <th className="border-b border-line px-3 py-2 text-right">수량·단가</th>
                      <th className="border-b border-line px-3 py-2 text-right">합계·수수료·순수납</th>
                      <th className="border-b border-line px-3 py-2 text-left">수단·상태</th>
                      <th className="border-b border-line px-3 py-2 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.items.map((sale) => (
                      <tr key={sale.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-fg">
                          <b>{sale.soldOn}</b>
                          <span className="block text-fg-subtle">
                            {sale.studentName} · {sale.studentTag ?? '태그 없음'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-fg">{sale.bookLabel}</td>
                        <td className="px-3 py-2 text-right text-fg">
                          {sale.quantity}권 · {won(sale.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right text-fg">
                          <b>{won(sale.totalAmount)}</b>
                          <span className="block text-fg-subtle">
                            {won(sale.feeAmount)} · {won(sale.netAmount)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-fg">
                          {PAYMENT_METHOD_LABEL[sale.paymentMethod]}
                          <span className="mt-1 block">
                            <Chip tone={sale.status === 'completed' ? 'success' : 'danger'}>
                              {sale.status === 'completed' ? '판매 완료' : '판매 취소'}
                            </Chip>
                            <span className="ml-2 text-fg-subtle">v{sale.version}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedId(sale.id)}>
                            상세
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title="교재 판매 상세"
        sub={selected ? `${selected.soldOn} · ${selected.studentName}` : undefined}
        footer={
          selected ? (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelectedId(null)}>
                닫기
              </Button>
              {selected.canCancel ? (
                <Button
                  variant="danger"
                  disabled={!onCancel || canceling}
                  onClick={() => {
                    setSelectedId(null);
                    setCancelTargetId(selected.id);
                    setCancelReason('');
                  }}
                >
                  판매 취소
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
            {[
              ['학생', `${selected.studentName} · ${selected.studentTag ?? '태그 없음'}`],
              ['교재', selected.bookLabel],
              ['판매일', selected.soldOn],
              ['결제 수단', PAYMENT_METHOD_LABEL[selected.paymentMethod]],
              ['수량 · 단가', `${selected.quantity}권 · ${won(selected.unitPrice)}`],
              ['판매 합계', won(selected.totalAmount)],
              ['지급수수료', won(selected.feeAmount)],
              ['순수납', won(selected.netAmount)],
              ['상태 · version', `${selected.status === 'completed' ? '판매 완료' : '판매 취소'} · v${selected.version}`],
              ['작성자', selected.createdBy],
            ].map(([term, value]) => (
              <div key={term} className="rounded-lg border border-line bg-inset p-3">
                <dt className="text-fg-subtle">{term}</dt>
                <dd className="mt-1 font-bold text-fg">{value}</dd>
              </div>
            ))}
            {selected.canceledReason ? (
              <div className="rounded-lg border border-line bg-inset p-3 sm:col-span-2">
                <dt className="text-fg-subtle">취소 actor · 사유</dt>
                <dd className="mt-1 font-bold text-fg">
                  {selected.canceledBy ?? '처리자 미상'} · {selected.canceledReason}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Drawer>

      <Dialog
        open={cancelTarget !== null}
        closeX
        onClose={() => setCancelTargetId(null)}
        title="교재 판매 취소"
        sub={
          cancelTarget ? `${cancelTarget.studentName} · ${won(cancelTarget.totalAmount)} · v${cancelTarget.version}` : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={canceling} onClick={() => setCancelTargetId(null)}>
              닫기
            </Button>
            <Button
              variant="danger"
              disabled={!cancelTarget || !onCancel || canceling || cancelReason.trim().length < 2}
              onClick={() => {
                if (cancelTarget && onCancel) {
                  onCancel(cancelTarget, cancelReason.trim());
                }
              }}
            >
              {canceling ? '취소 처리 중…' : '취소 확정'}
            </Button>
          </div>
        }
      >
        <Banner tone="warning" className="mb-3">
          원 판매와 최초 입금은 보존하고, 서버가 열린 현재 월에 보정 입금을 기록합니다. 처리 중에는 중복 제출할 수 없습니다.
        </Banner>
        <Label htmlFor={`${id}-cancel-reason`}>취소 사유</Label>
        <Textarea
          id={`${id}-cancel-reason`}
          autoFocus
          value={cancelReason}
          maxLength={200}
          error={cancelReason.length > 0 && cancelReason.trim().length < 2}
          aria-invalid={cancelReason.length > 0 && cancelReason.trim().length < 2}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="두 글자 이상 입력"
        />
        <FieldError>
          {cancelReason.length > 0 && cancelReason.trim().length < 2 ? '취소 사유를 두 글자 이상 적어 주세요' : undefined}
        </FieldError>
      </Dialog>
    </div>
  );
}
