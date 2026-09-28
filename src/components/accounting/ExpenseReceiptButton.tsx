/** @file-guide
 * 목적: ExpenseDto의 보존 영수증을 공용 FILE 다운로드 단추로 연결한다.
 * 책임/재사용: 회계 심사와 내 신청 목록이 같은 additive 계약 경계와 같은 라벨을 쓴다. ACL은 서버가 판정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import type { Expense } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';

export function ExpenseReceiptButton({ expense }: { expense: Expense }) {
  const file = expense.receiptFile;
  return file ? <FileDownloadButton id={file.id} label="영수증" /> : null;
}
