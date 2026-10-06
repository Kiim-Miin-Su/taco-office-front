/** @file-guide
 * 목적: 최종 관리자 수정사항 p94·101·115와 Figma A22의 교재 판매·결제 수단 수수료를 생성 계약 전 Front 경계로 제공한다. (component)
 * 책임/재사용: 기존 /meta 학생과 /books 카탈로그만 읽고, 판매·재고·청구/PAY·수수료 정책과 저장 성공은 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useState } from 'react';
import { useMeta } from '@/api/queries';
import type { Books } from '@/api/types';
import { Banner, Button, Chip, FieldError, Input, Label, Panel, Select, Textarea } from '@/components/ui';
import { todayKst } from '@/lib/calendar';

const SUMMARY_FIELDS = ['건수', '금액 · 비중', '지급수수료', '순수납'] as const;

export function BookSalesFeeBoundary({
  books,
  booksLoading,
  onOpenPayments,
  onOpenBooks,
}: {
  books: Books | undefined;
  booksLoading: boolean;
  onOpenPayments: () => void;
  onOpenBooks: () => void;
}) {
  const id = useId();
  const meta = useMeta();
  const [studentId, setStudentId] = useState('');
  const [bookId, setBookId] = useState('');
  const [soldOn, setSoldOn] = useState(todayKst());
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [memo, setMemo] = useState('');
  const [touched, setTouched] = useState({ student: false, book: false, date: false, quantity: false, price: false });

  const quantityNumber = Number(quantity);
  const priceNumber = Number(unitPrice);
  const studentError = touched.student && studentId === '';
  const bookError = touched.book && bookId === '';
  const dateError = touched.date && soldOn === '';
  const quantityError = touched.quantity && (!Number.isInteger(quantityNumber) || quantityNumber < 1);
  const priceError = touched.price && (!Number.isInteger(priceNumber) || priceNumber < 0);

  const reset = () => {
    setStudentId('');
    setBookId('');
    setSoldOn(todayKst());
    setQuantity('1');
    setUnitPrice('');
    setMemo('');
    setTouched({ student: false, book: false, date: false, quantity: false, price: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="warning">생성 계약 대기</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">교재 판매 · 결제 수수료</h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-fg-subtle">
              교재 카탈로그에서 판매 대상을 고르고, 판매·청구·입금·재고 이동을 한 거래로 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={onOpenPayments}>입금 기록 보기</Button>
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={onOpenBooks}>교재 목록 관리</Button>
          </div>
        </header>

        <Banner tone="warning" className="mb-4">
          수기 입금은 청구서가 없는 돈의 입금 기록이며 <b>교재 판매 원장을 대신하지 않습니다.</b> 판매 저장은 재고·청구/PAY·취소/환불·월 마감 계약이 함께 생긴 뒤 엽니다.
        </Banner>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="교재 판매 입력">
          <div>
            <Label htmlFor={`${id}-student`}>대상 학생</Label>
            <Select className="max-sm:h-11" id={`${id}-student`} value={studentId} error={studentError} aria-invalid={studentError}
              onBlur={() => setTouched((value) => ({ ...value, student: true }))}
              onChange={(event) => setStudentId(event.target.value)}>
              <option value="">선택</option>
              {(meta.data?.students ?? []).map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
            </Select>
            <FieldError>{studentError ? '학생을 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-book`}>판매 교재</Label>
            <Select className="max-sm:h-11" id={`${id}-book`} value={bookId} error={bookError} aria-invalid={bookError}
              disabled={booksLoading}
              onBlur={() => setTouched((value) => ({ ...value, book: true }))}
              onChange={(event) => setBookId(event.target.value)}>
              <option value="">{booksLoading ? '불러오는 중…' : '선택'}</option>
              {(books?.items ?? []).map((book) => (
                <option key={book.id} value={book.id}>{book.code} · {book.title}{book.edition ? ` · ${book.edition}` : ''}</option>
              ))}
            </Select>
            <FieldError>{bookError ? '교재를 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-sold-on`}>판매일</Label>
            <Input className="max-sm:h-11" id={`${id}-sold-on`} type="date" value={soldOn} error={dateError} aria-invalid={dateError}
              onBlur={() => setTouched((value) => ({ ...value, date: true }))}
              onChange={(event) => setSoldOn(event.target.value)} />
            <FieldError>{dateError ? '판매일을 골라 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-quantity`}>수량</Label>
            <Input className="max-sm:h-11" id={`${id}-quantity`} type="number" min={1} step={1} inputMode="numeric" value={quantity}
              error={quantityError} aria-invalid={quantityError}
              onBlur={() => setTouched((value) => ({ ...value, quantity: true }))}
              onChange={(event) => setQuantity(event.target.value)} />
            <FieldError>{quantityError ? '1권 이상의 정수를 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-unit-price`} hint="원">개당 판매가</Label>
            <Input className="max-sm:h-11" id={`${id}-unit-price`} type="number" min={0} step={1000} inputMode="numeric" value={unitPrice}
              error={priceError} aria-invalid={priceError}
              onBlur={() => setTouched((value) => ({ ...value, price: true }))}
              onChange={(event) => setUnitPrice(event.target.value)} placeholder="예: 25000" />
            <FieldError>{priceError ? '0원 이상의 정수로 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-payment-method`} hint="서버 코드표 대기">결제 수단</Label>
            <Select className="max-sm:h-11" id={`${id}-payment-method`} disabled value="">
              <option value="">선택지 계약 대기</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-memo`} hint="선택">판매 메모</Label>
            <Textarea id={`${id}-memo`} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="환불·할인·증빙에 필요한 메모" />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-line-2 bg-inset px-3 py-3 text-[12px] font-medium text-fg-2">
          판매 합계 · 서버 계산 후 표시
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={reset}>초기화</Button>
          <Button className="max-sm:min-h-11" size="sm" disabled title="판매·재고·청구/PAY 생성 계약이 필요합니다">교재 판매 저장 준비 중</Button>
        </div>
      </Panel>

      <Panel>
        <header className="mb-3">
          <div className="mb-1"><Chip tone="warning">집계 계약 대기</Chip></div>
          <h3 className="text-[15px] font-bold text-fg">결제 수단별 정산</h3>
          <p className="mt-1 text-[12px] text-fg-subtle">선택 기간의 결제 수단별 건수·금액·비중·지급수수료·순수납을 서버 집계로 읽습니다.</p>
        </header>
        <Banner tone="neutral" className="mb-3">
          결제 수단 코드, 수수료율과 반올림 기준을 화면에서 정하지 않습니다. 거래 당시 정책 snapshot과 취소·환불을 반영한 서버 결과만 표시합니다.
        </Banner>
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="region" aria-label="결제 수단별 집계 계약">
          {SUMMARY_FIELDS.map((field) => (
            <div key={field} className="rounded-xl border border-line bg-inset p-3">
              <div className="text-[11px] text-fg-subtle">{field}</div>
              <b className="mt-1 block text-[16px] text-fg">—</b>
            </div>
          ))}
        </section>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="교재 판매 생성 계약 필드">
          {['판매·환불 version', 'invoiceId · payId', '재고 이동 · 판매 snapshot', '증빙 · 월 마감 상태'].map((field) => (
            <div key={field} className="rounded-lg border border-dashed border-line-2 bg-card px-3 py-2 text-[12px] font-medium text-fg-2">{field}</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
