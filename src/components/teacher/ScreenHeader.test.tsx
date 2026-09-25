/** @file-guide
 * 목적: ScreenHeader.test.tsx (test)
 * 책임/재사용: 화면 머리 한 곳의 두 갈래만 본다 — 강사 표면은 제목(h1)을 다시 세우지 않고 부제·도구만, 관리 화면은 공용 PageHeader 그대로.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { ScreenHeader } from './ScreenHeader';

const teacher = { id: 7, name: '김재훈', canAdminPage: false, canCrudAll: false } as unknown as Me;

afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); });

describe('ScreenHeader — 셸 머리줄과 본문 제목이 겹치지 않는다', () => {
  it('강사 표면 — h1 없이 부제와 도구만 선다', () => {
    useSession.setState({ me: teacher, ready: true });
    const view = render(<ScreenHeader title="리포트" sub="내 수업 리포트를 확인하고 작성합니다." right={<button type="button">도구</button>} />);
    expect(view.queryByRole('heading')).toBeNull();
    expect(view.getByText('내 수업 리포트를 확인하고 작성합니다.')).toBeTruthy();
    expect(view.getByRole('button', { name: '도구' })).toBeTruthy();
  });

  it('강사 표면 — 부제도 도구도 없으면 빈 줄을 세우지 않는다', () => {
    useSession.setState({ me: teacher, ready: true });
    const view = render(<ScreenHeader title="캘린더" />);
    expect(view.container.firstChild).toBeNull();
  });

  it('관리 화면 — 공용 PageHeader 의 h1 이 그대로 선다(셸 머리줄에 화면 이름이 없다)', () => {
    useSession.setState({ me: { ...teacher, canAdminPage: true, canCrudAll: true } as Me, ready: true });
    const view = render(<ScreenHeader title="리포트" sub="부제" />);
    expect(view.getByRole('heading', { level: 1, name: '리포트' })).toBeTruthy();
    expect(view.getByText('부제')).toBeTruthy();
  });
});
