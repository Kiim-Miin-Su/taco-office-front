/** @file-guide
 * 목적: PhoneInput.tsx — PhoneValue, splitPhone, composePhone, samePhone, PhoneInput (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 휴대폰 번호 칸 — 국가번호 고르기 + 번호 (N-103 · 대표 결정 2026-09-26 「해외 번호도 받기 — 국가번호를 고르고 번호를 적는다」).
 * 첫 설정 화면과 구성원 만들기 · 수정 창이 같이 쓴다.
 *
 * 나라 목록은 서버가 준다(`phoneCountries` · **첫 줄이 국내** = `+` 없이 보내는 나라). 화면은 나라 이름을 따로 적지 않는다(D-R18).
 * 보내는 모양은 글 하나다 — 국내는 적은 그대로(지금까지와 같다), 해외는 `+국가번호 번호`. 모양 판정 · 정규화는 서버 한 곳(lib/phone)이 한다.
 * 목록이 비어 있으면 국가번호 칸 없이 번호 칸만 선다(지금까지의 모양).
 */
'use client';
import { Input, Select } from '../ui';
import type { PhoneCountry } from '@/api/types';

export interface PhoneValue {
  /** 국가번호(`+` 없이) — 빈 글이면 국내 */
  country: string;
  /** 사람이 적은 번호 그대로 */
  local: string;
}

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * 저장된 번호 → 칸 값. 국내 번호(`+` 없음)는 첫 줄 나라로, `+…` 는 목록에서 나라를 찾는다
 * (국가번호는 서로의 앞자락이 아니라서 맞는 것은 많아야 하나다). 목록에 없으면 적힌 그대로 둔다 — 보낼 때도 그대로 간다.
 */
export function splitPhone(stored: string | null | undefined, countries: readonly PhoneCountry[]): PhoneValue {
  const domestic = countries[0]?.code ?? '';
  const text = (stored ?? '').trim();
  if (!text.startsWith('+')) return { country: domestic, local: text };
  const digits = digitsOf(text);
  // 국내 나라는 `+` 모양으로 저장되지 않는다(서버가 숫자만으로 바꾼다) — 찾지 않는다
  const hit = countries.find((c) => c.code !== domestic && digits.startsWith(c.code));
  return hit ? { country: hit.code, local: digits.slice(hit.code.length) } : { country: domestic, local: text };
}

/** 칸 값 → 보낼 글. 비었으면 빈 글 · 번호에 `+` 를 직접 적었으면 그대로 · 국내는 적은 그대로 · 해외는 `+국가번호 번호` */
export function composePhone(value: PhoneValue, countries: readonly PhoneCountry[]): string {
  const local = value.local.trim();
  if (!local) return '';
  if (local.startsWith('+')) return local;
  const domestic = countries[0]?.code ?? '';
  if (!value.country || value.country === domestic) return local;
  return `+${value.country} ${local}`;
}

/**
 * 두 번호가 같은가 — 공백 · 하이픈 · 괄호만 다른 것은 같다. 「바뀐 칸만 보내기」용 비교일 뿐이고
 * 모양이 맞는지 · 같은 번호인지의 판정은 서버가 한다(같은 값이면 서버가 EMPTY_PATCH 로 답한다).
 */
export function samePhone(a: string, b: string): boolean {
  const key = (text: string) => (text.trim().startsWith('+') ? '+' : '') + digitsOf(text);
  return key(a) === key(b);
}

export function PhoneInput({ id, countries, value, onChange, disabled, maxLength = 20 }: {
  /** 번호 칸의 id — 바깥 `<Label htmlFor>` 가 번호 칸을 가리킨다 */
  id: string;
  countries: readonly PhoneCountry[];
  value: PhoneValue;
  onChange: (next: PhoneValue) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  const withCountry = countries.length > 0;
  const number = (
    <Input
      id={id} type="tel" inputMode="tel" autoComplete={withCountry ? 'tel-national' : 'tel'}
      className="min-w-0 flex-1" value={value.local} maxLength={maxLength} disabled={disabled}
      onChange={(e) => onChange({ ...value, local: e.currentTarget.value })}
    />
  );
  if (!withCountry) return number;
  return (
    <div className="flex gap-1.5">
      {/* 너비는 감싼 칸이 정한다 — 공용 Select 는 늘 `w-full` 이고 `cn` 은 같은 속성의 클래스를 합치지 않아
          Select 에 너비 클래스를 겹쳐 주면 CSS 뒤쪽의 `w-full` 이 이긴다(국가번호가 한 줄을 다 먹고 번호 칸이 26px 로 눌렸다 · QA 0926) */}
      <div className="w-[132px] shrink-0">
        <Select
          aria-label="국가번호" value={value.country || countries[0].code} disabled={disabled}
          onChange={(e) => onChange({ ...value, country: e.currentTarget.value })}
        >
          {countries.map((c) => <option key={c.code} value={c.code}>{`+${c.code} ${c.label}`}</option>)}
        </Select>
      </div>
      {number}
    </div>
  );
}
