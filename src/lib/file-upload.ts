/** @file-guide
 * 목적: 브라우저 File을 공용 POST /files JSON 계약으로 변환한다.
 * 책임/재사용: 바이트→base64 변환만 소유하며 파일 종류·권한·크기 판정은 서버 DTO/방어함수에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { uploadPresigned } from '@vercel/blob/client';
import type { OnUploadProgressCallback } from '@vercel/blob';
import type { BookPdfUploadIntent, BookPdfUploadUrl, FileUpload } from '@/api/types';
import { ApiError, api, getApiUploadHeaders, getSessionGeneration } from '@/api/client';

export const LEGACY_BOOK_PDF_MAX_BYTES = 50_000_000;
export const BOOK_PDF_MAX_BYTES = 1_000_000_000;

export function bookPdfFileLimitLabel(maxFileBytes: number): string {
  return maxFileBytes >= 1_000_000_000 ? `${maxFileBytes / 1_000_000_000}GB` : `${maxFileBytes / 1_000_000}MB`;
}

type BookPdfUploadOptions = {
  maxFileBytes?: number;
  abortSignal?: AbortSignal;
  onUploadProgress?: OnUploadProgressCallback;
};

/** 신규 교재 PDF는 브라우저에서 비공개 Blob으로 직접 보낸다. URL은 영속 저장하지 않는다. */
export async function uploadBookPdf(file: File, kind: 'lib-se' | 'lib-te', options: BookPdfUploadOptions = {}): Promise<string> {
  const maxFileBytes = options.maxFileBytes ?? BOOK_PDF_MAX_BYTES;
  const issue = bookPdfSelectionIssue([file], maxFileBytes * 2, maxFileBytes);
  if (issue) {
    throw new ApiError('BOOK_PDF_INVALID', issue, 400);
  }
  const generation = getSessionGeneration();
  const body: BookPdfUploadIntent = {
    kind, name: file.name, bytes: file.size,
  };
  const { data } = await api.post<BookPdfUploadUrl>('/files/book-pdf-upload', body, { signal: options.abortSignal });
  if (getSessionGeneration() !== generation) {
    throw new ApiError('SESSION_CHANGED', '로그인 상태가 바뀌어 PDF 전송을 취소했습니다.', 0);
  }
  const headers = getApiUploadHeaders();
  try {
    // SDK는 File을 여러 부분으로 전송하고 실패한 부분만 재시도한다. read-write token은 브라우저에 전달하지 않는다.
    const transfer = uploadPresigned(data.pathname, file, {
      access: 'private', contentType: 'application/pdf', multipart: true,
      handleUploadUrl: api.getUri({ url: '/files/book-pdf-presigned' }),
      clientPayload: data.uploadId, headers,
      abortSignal: options.abortSignal, onUploadProgress: options.onUploadProgress,
    });
    // SDK 2.8의 서명 발급 대기는 signal을 전달하지 않는다. 취소 시 UI를 즉시 풀고 늦은 결과는 버린다.
    await new Promise<void>((resolve, reject) => {
      const signal = options.abortSignal;
      const abort = () => reject(new Error('PDF 전송을 취소했습니다.'));
      signal?.addEventListener('abort', abort, { once: true });
      transfer.then(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, (cause: unknown) => {
        signal?.removeEventListener('abort', abort);
        reject(cause);
      });
      if (signal?.aborted) {
        abort();
      }
    });
  } catch (cause) {
    // SDK 오류에 서명 URL 등이 포함될 수 있어 공개 문구만 전달한다.
    if (options.abortSignal?.aborted) {
      throw new ApiError('BOOK_PDF_UPLOAD_CANCELED', 'PDF 업로드를 취소했습니다.', 499);
    }
    if (cause instanceof Error && cause.message.includes('Failed to retrieve the presigned URL')) {
      throw new ApiError('BOOK_PDF_UPLOAD_AUTHORIZATION_FAILED', '업로드 주소를 받지 못했습니다. 로그인 상태·업로드 권한·업로드 설정·연결을 확인한 뒤 다시 시도해 주세요.', 502);
    }
    throw new ApiError('BOOK_PDF_UPLOAD_FAILED', 'PDF 업로드를 완료하지 못했습니다. 다시 시도해 주세요.', 502);
  }
  if (options.abortSignal?.aborted) {
    throw new ApiError('BOOK_PDF_UPLOAD_CANCELED', 'PDF 업로드를 취소했습니다.', 499);
  }
  if (getSessionGeneration() !== generation) {
    throw new ApiError('SESSION_CHANGED', '로그인 상태가 바뀌어 PDF 전송을 취소했습니다.', 0);
  }
  return data.uploadId;
}

export function bookPdfSelectionIssue(files: Array<File | null>, maxTotalBytes: number, maxFileBytes = BOOK_PDF_MAX_BYTES): string | null {
  for (const file of files) {
    if (!file) {
      continue;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return '교재는 PDF 파일만 올릴 수 있습니다';
    }
    if (file.size < 1) {
      return '비어 있는 PDF는 올릴 수 없습니다';
    }
    if (file.size > maxFileBytes) {
      return `교재 PDF는 파일당 ${bookPdfFileLimitLabel(maxFileBytes)}까지 올릴 수 있습니다`;
    }
  }
  return fileSelectionIssue(files, maxTotalBytes);
}

/** 서버가 내려준 한 판 합계 상한으로 선택 즉시 막는다. 최종 판정은 같은 값의 서버 방어가 한다. */
export function fileSelectionIssue(files: Array<File | null>, maxBytes: number): string | null {
  const total = files.reduce((sum, file) => sum + (file?.size ?? 0), 0);
  return total > maxBytes ? `SE·TE 파일 합계는 ${(maxBytes / 1_000_000).toFixed(0)}MB까지 올릴 수 있습니다` : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function fileUploadBody(file: File, kind: FileUpload['kind']): Promise<FileUpload> {
  return {
    kind,
    name: file.name,
    base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
  };
}
