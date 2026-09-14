/** @file-guide
 * 목적: 브라우저 File→POST /files 입력 변환이 이름·MIME·바이트를 보존하는지 검증한다.
 * 책임/재사용: 실제 fileUploadBody만 호출하고 서버 종류/크기 규칙은 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { expect, it } from 'vitest';
import { fileSelectionIssue, fileUploadBody } from './file-upload';

it('파일 본문과 종류를 공용 base64 계약으로 바꾼다', async () => {
  const file = {
    name: '학생용.pdf', type: 'application/pdf',
    arrayBuffer: async () => new TextEncoder().encode('SE 교재').buffer,
  } as File;
  const body = await fileUploadBody(file, 'lib-se');
  expect(body).toMatchObject({ kind: 'lib-se', name: '학생용.pdf' });
  expect(body).not.toHaveProperty('mime');
  expect(new TextDecoder().decode(Uint8Array.from(atob(body.base64), (char) => char.charCodeAt(0)))).toBe('SE 교재');
});

it('판 파일 합계는 서버가 내려준 상한으로 선택 즉시 검증한다', () => {
  const file = (size: number) => ({ size } as File);
  expect(fileSelectionIssue([file(1_500_000), file(1_500_000)], 3_000_000)).toBeNull();
  expect(fileSelectionIssue([file(2_000_000), file(2_000_000)], 3_000_000)).toContain('3MB');
});
