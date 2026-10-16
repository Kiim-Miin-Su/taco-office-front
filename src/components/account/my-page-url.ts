/** @file-guide
 * 목적: my-page-url.ts — MY_PAGE_QUERY, myPageHref, useMyPageUrl (component)
 * 책임/재사용: 마이 페이지 대화상자의 열림을 URL 질의(`?mypage=1`) 하나로 소유한다. 셸(AppShell · TeacherShell)과 「오늘」 띠가 같은 규칙을 쓴다. 권한 · 프로필 판정은 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 마이 페이지는 라우트가 아니라 **지금 화면 위의 대화상자**다 (강사 PPTX p5·p98·p103 · 사용자 결정 2026-10-16 · Figma 색인 D1).
 * 열림을 질의에 두어 새로고침 · 딥링크에도 다시 서게 하고, 닫을 때는 그 질의만 걷어 다른 질의(날짜 · 탭 · 회의 등)를 보존한다.
 * 여닫기는 `replace` 다 — 뒤로 가기가 대화상자를 다시 여는 기록을 남기지 않는다(홈 `?meeting=` 창과 같은 관례).
 */
'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** 질의 이름 — 값이 `1` 일 때만 연다 */
export const MY_PAGE_QUERY = 'mypage';

/** 지금 경로 · 질의에 마이 페이지를 켜거나 끈 주소 — 다른 질의는 차례까지 그대로 둔다 */
export function myPageHref(pathname: string, search: string, open: boolean): string {
  const params = new URLSearchParams(search);
  if (open) {
    params.set(MY_PAGE_QUERY, '1');
  } else {
    params.delete(MY_PAGE_QUERY);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export interface MyPageUrl {
  /** 지금 주소가 마이 페이지를 열고 있는가 */
  open: boolean;
  /** 지금 화면 위에 마이 페이지를 여는 주소 — 링크(메뉴 패널 사용자 칸)용 */
  href: string;
  show: () => void;
  close: () => void;
}

export function useMyPageUrl(): MyPageUrl {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const open = new URLSearchParams(search).get(MY_PAGE_QUERY) === '1';
  const href = myPageHref(pathname, search, true);
  const show = useCallback(() => router.replace(href, { scroll: false }), [router, href]);
  const close = useCallback(
    () => router.replace(myPageHref(pathname, search, false), { scroll: false }),
    [router, pathname, search],
  );
  return { open, href, show, close };
}
