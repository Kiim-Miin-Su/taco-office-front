/** @file-guide
 * 목적: PhoneInput.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 휴대폰 번호 칸 (N-103 · 대표 결정 2026-09-26 「해외 번호도 받기」) — 보내는 글 모양과 저장된 번호 되짚기만 본다.
 * 번호가 맞는지는 서버가 판정한다(여기서 모양 규칙을 다시 세우지 않는다).
 */
import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PhoneCountry } from '@/api/types';
import { PhoneInput, composePhone, samePhone, splitPhone, type PhoneValue } from './PhoneInput';

const COUNTRIES: PhoneCountry[] = [
  { code: '82', label: '대한민국' }, { code: '1', label: '미국 · 캐나다' }, { code: '852', label: '홍콩' }, { code: '44', label: '영국' },
];

afterEach(cleanup);

describe('보내는 글 · 저장된 번호 되짚기', () => {
  it('국내(첫 줄)는 적은 그대로 · 해외는 「+국가번호 번호」 · 비면 빈 글 · + 를 직접 적었으면 그대로', () => {
    expect(composePhone({ country: '82', local: ' 010-1234-5678 ' }, COUNTRIES)).toBe('010-1234-5678');
    expect(composePhone({ country: '', local: '01012345678' }, COUNTRIES)).toBe('01012345678');
    expect(composePhone({ country: '1', local: '(415) 555-0123' }, COUNTRIES)).toBe('+1 (415) 555-0123');
    expect(composePhone({ country: '1', local: '  ' }, COUNTRIES)).toBe('');
    expect(composePhone({ country: '82', local: '+44 7911 123456' }, COUNTRIES)).toBe('+44 7911 123456');
    // 목록이 없으면(옛 서버) 적은 그대로 — 지금까지와 같다
    expect(composePhone({ country: '', local: '010-1234-5678' }, [])).toBe('010-1234-5678');
  });

  it('저장된 번호를 나라와 번호로 되짚는다 — 국내는 첫 줄 · 해외는 목록에서 · 모르는 나라는 적힌 그대로', () => {
    expect(splitPhone('01012345678', COUNTRIES)).toEqual({ country: '82', local: '01012345678' });
    expect(splitPhone('+14155550123', COUNTRIES)).toEqual({ country: '1', local: '4155550123' });
    expect(splitPhone('+85291234567', COUNTRIES)).toEqual({ country: '852', local: '91234567' });
    expect(splitPhone(null, COUNTRIES)).toEqual({ country: '82', local: '' });
    expect(splitPhone('+84912345678', COUNTRIES)).toEqual({ country: '82', local: '+84912345678' });
    expect(splitPhone('+14155550123', [])).toEqual({ country: '', local: '+14155550123' });
  });

  it('되짚은 값을 다시 보내면 같은 번호다 — 손대지 않은 칸은 「바뀐 칸」이 아니다', () => {
    for (const stored of ['01012345678', '+14155550123', '+447911123456', '']) {
      expect(samePhone(composePhone(splitPhone(stored, COUNTRIES), COUNTRIES), stored)).toBe(true);
    }
    expect(samePhone('010-1234-5678', '01012345678')).toBe(true);
    expect(samePhone('+1 (415) 555-0123', '+14155550123')).toBe(true);
    expect(samePhone('01012345678', '01012345679')).toBe(false);
    expect(samePhone('+14155550123', '14155550123')).toBe(false);
  });
});

function Harness({ countries, initial }: { countries: PhoneCountry[]; initial: PhoneValue }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="p">휴대폰</label>
      <PhoneInput id="p" countries={countries} value={value} onChange={setValue} />
      <output>{composePhone(value, countries)}</output>
    </>
  );
}

describe('칸', () => {
  it('국가번호는 서버 목록 그대로 고르고 · 라벨은 번호 칸을 가리킨다', () => {
    const view = render(<Harness countries={COUNTRIES} initial={{ country: '', local: '' }} />);
    const select = view.getByRole('combobox', { name: '국가번호' }) as HTMLSelectElement;
    expect(select.value).toBe('82');
    expect([...select.options].map((o) => o.textContent)).toEqual(['+82 대한민국', '+1 미국 · 캐나다', '+852 홍콩', '+44 영국']);
    fireEvent.change(select, { target: { value: '44' } });
    fireEvent.change(view.getByLabelText('휴대폰'), { target: { value: '07911 123456' } });
    expect(view.container.querySelector('output')?.textContent).toBe('+44 07911 123456');
  });

  it('국가번호 칸의 너비는 감싼 칸이 정한다 — Select 에 너비 클래스를 겹쳐 주면 공용 w-full 이 이겨 번호 칸이 눌린다(QA 0926)', () => {
    const view = render(<Harness countries={COUNTRIES} initial={{ country: '', local: '' }} />);
    const select = view.getByRole('combobox', { name: '국가번호' });
    // 공용 Select 의 w-full 하나만 — 다른 너비가 같이 붙으면 어느 쪽이 이기는지는 CSS 순서가 정한다(cn 은 합치지 않는다)
    expect(select.className.split(/\s+/).filter((c) => /^w-/.test(c))).toEqual(['w-full']);
    expect(select.parentElement?.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-[132px]', 'shrink-0']));
    // 번호 칸은 남은 자리를 채운다
    expect(view.getByLabelText('휴대폰').className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
  });

  it('목록이 없으면 국가번호 칸 없이 번호 칸만 선다', () => {
    const view = render(<Harness countries={[]} initial={{ country: '', local: '010' }} />);
    expect(view.queryByRole('combobox')).toBeNull();
    expect((view.getByLabelText('휴대폰') as HTMLInputElement).value).toBe('010');
  });
});
