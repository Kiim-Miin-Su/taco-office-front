/** @file-guide
 * 목적: 브라우저 File을 공용 POST /files JSON 계약으로 변환한다.
 * 책임/재사용: 바이트→base64 변환만 소유하며 파일 종류·권한·크기 판정은 서버 DTO/방어함수에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { FileUpload } from '@/api/types';

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
