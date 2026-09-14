/** @file-guide
 * 목적: §30 공용 파일 영역의 드래그앤드롭과 disabled 경계를 검증한다.
 * 책임/재사용: 실제 ConsultingFileDropzone의 브라우저 파일 전달만 시험한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ConsultingFileDropzone } from './ConsultingFileDropzone';

it('놓은 파일을 같은 선택 callback으로 전달하고 disabled면 무시한다', () => {
  const onFiles = vi.fn();
  const file = new File(['contract'], 'contract.pdf', { type: 'application/pdf' });
  const view = render(<ConsultingFileDropzone label="계약서 고르기" hint="끌어 놓기" multiple onFiles={onFiles} />);
  fireEvent.dragOver(view.getByRole('button', { name: /계약서 고르기/ }));
  fireEvent.drop(view.getByRole('button', { name: /계약서 고르기/ }), { dataTransfer: { files: [file] } });
  expect(onFiles).toHaveBeenCalledWith([file]);

  view.rerender(<ConsultingFileDropzone label="계약서 고르기" hint="끌어 놓기" disabled onFiles={onFiles} />);
  fireEvent.drop(view.getByRole('button', { name: /계약서 고르기/ }), { dataTransfer: { files: [file] } });
  expect(onFiles).toHaveBeenCalledTimes(1);
});
