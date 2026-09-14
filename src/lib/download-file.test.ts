/** @file-guide
 * 목적: 인증 파일 다운로드의 서버 파일명 해석 경계를 검증한다.
 * 책임/재사용: 실제 공용 함수만 호출하며 브라우저 네트워크·권한 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { expect, it } from 'vitest';
import { downloadName } from './download-file';

it('RFC 5987 파일명을 한글로 복원하고 잘못된 값은 안전한 이름으로 내린다', () => {
  expect(downloadName("attachment; filename*=UTF-8''%EA%B5%90%EC%9E%AC.pdf", 'file')).toBe('교재.pdf');
  expect(downloadName("attachment; filename*=UTF-8''%E0%A4%A", 'file.pdf')).toBe('file.pdf');
  expect(downloadName(undefined, 'file.pdf')).toBe('file.pdf');
});
