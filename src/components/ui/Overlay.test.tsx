import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, Drawer } from './Overlay';

describe('Overlay 접근성 이름', () => {
  it('공용 Drawer와 Dialog 제목을 dialog의 접근성 이름으로 연결한다', () => {
    const view = render(
      <>
        <Drawer open onClose={() => undefined} title="수업 상세">내용</Drawer>
        <Dialog open onClose={() => undefined} title="명단 변경 후 준비할 일">내용</Dialog>
      </>,
    );

    expect(view.getByRole('dialog', { name: '수업 상세' })).toBeTruthy();
    expect(view.getByRole('dialog', { name: '명단 변경 후 준비할 일' })).toBeTruthy();
  });
});
