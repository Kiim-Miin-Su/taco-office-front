"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import isActiveRoute from "../../util/isActiveRoute";
import { MenuIcons } from "../../constants/menuIcon";
import { EllipsisVertical } from "lucide-react";
import { AsidePermission } from "../../constants/asidePermission";

import { getAsidePermissionsByRole } from "../../constants/asidePermission";

import { NAVIGATION_SECTIONS } from "@/components/aside/types/navigationType";
import { User } from "@/entity/user.entity";

type AsideProps = {
  user: Pick<User, "userRole" | "staffRole" | "username">;
};

export default function Aside({ user }: AsideProps) {
  const pathname = usePathname();
  const permissionSet = new Set<AsidePermission>(getAsidePermissionsByRole(user.userRole));
  const visibleSections = NAVIGATION_SECTIONS.map((section) => ({
    ...section, // 기존 const NAVIGATION_SECTIONS 값 복사
    items: section.items.filter((item) => permissionSet.has(item.permission)), // 덮어쓰기 (권한 소유 배열)
  })).filter((section) => section.items.length > 0); // 배열이 0이면 해당 Item 그룹 삭제

  return (
    <aside className="flex h-dvh w-[272px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="grid size-9 place-items-center rounded-[10px] bg-brand-600 text-sm font-bold text-white shadow-sm shadow-brand-200">T</div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-foreground">TN Office</p>
          <p className="mt-0.5 text-[11px] font-medium text-foreground-subtle">Education ERP</p>
        </div>
      </div>

      <div className="px-3 pt-4">
        <button className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50" type="button">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-100 text-[13px] font-bold text-brand-700">
            {/* FIXME: fetch 지점 정보 -> text & color*/}
            강남
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {/* FIXME: fetch 지점 -> 유저 정보 */}
              {user.staffRole ?? "Staff"} {user.username}
            </span>
          </span>
          {/* <ChevronDown aria-hidden="true" className="size-4 shrink-0" /> */}
        </button>
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-4">
        {visibleSections.map((section) => (
          <div className="mb-5 last:mb-0" key={section.id}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-subtle">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = isActiveRoute(pathname, item.href);
                const MenuIcon = MenuIcons[item.icon];

                return (
                  <Link aria-current={isActive ? "page" : undefined} className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"}`} href={item.href} key={item.id}>
                    {isActive && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600" /> // | 모양 선
                    )}
                    <span // Icon section
                      className={isActive ? "text-brand-600" : "text-foreground-subtle group-hover:text-foreground-muted"}
                    >
                      <MenuIcon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
                    </span>
                    {/* real menu name */}
                    <span className="truncate">{item.label}</span>{" "}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex w-full items-center gap-3 rounded-lg p-2 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{user.username}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-foreground">
              {user.userRole}
            </span>
            {/* <span className="mt-0.5 block truncate text-[12px] text-foreground-muted">{user.userRole}</span> */}
          </span>
          {/* TODO: make user-setting page */}
          <button className="transition-colors hover:bg-surface-muted p-1">
            <EllipsisVertical aria-hidden="true" className="size-[20px] shrink-0" />
          </button>
        </div>
      </div>
    </aside>
  );
}
