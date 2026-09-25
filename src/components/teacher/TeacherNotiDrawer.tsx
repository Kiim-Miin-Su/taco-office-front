/** @file-guide
 * 목적: TeacherNotiDrawer.tsx — TeacherNotiDrawer (component)
 * 책임/재사용: 강사 머리줄 🔔 가 여는 「내 알림」 목록. 목록·배지·창(일)은 GET /teacher/shell 서버 값만 그리고, 읽음은 useTeacherNotiRead(서랍의 본인 한정 경로)로만 쓴다. 이동 가능 여부는 navigation.ts 의 직접 URL 판정을 그대로 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 덱 머리줄의 🔔(배지 3) — 강사 화면 7개 어디에도 관리자 서랍이 없으므로 **내게 온 알림 한 목록**만 연다
 * (N-26 을 D-R44 로 좁게 읽음: 승인 대기함·구성원·줌 같은 서랍 칸은 짓지 않는다).
 * 줄을 누르면 읽음으로 바꾸고, 원본 경로가 **강사에게 열린 화면**일 때만 그리로 간다 — 관리 화면 경로를 가리키는
 * 알림은 읽음만 된다(눌러서 403 화면으로 보내지 않는다).
 */
'use client';
import { useRouter } from 'next/navigation';
import type { Me, TeacherShell } from '@/api/types';
import { useTeacherNotiRead } from '@/api/queries';
import { Button, Chip, Drawer, cn } from '@/components/ui';
import { canAccessAppRoute } from '@/components/shell/navigation';

/** 'YYYY-MM-DDTHH:MI:SS+09:00' → 'M/D HH:MI' (KST 글자 그대로 — 시각 계산 없음) */
const shortAt = (at: string): string => `${Number(at.slice(5, 7))}/${Number(at.slice(8, 10))} ${at.slice(11, 16)}`;

export function TeacherNotiDrawer({ open, onClose, shell, me }: {
  open: boolean;
  onClose: () => void;
  shell: TeacherShell | undefined;
  me: Me | null;
}) {
  const router = useRouter();
  const read = useTeacherNotiRead();
  const notis = shell?.notis ?? [];

  function openNoti(id: number, isRead: boolean, link: string | null | undefined) {
    if (!isRead) read.mutate({ id });
    const path = link?.split(/[?#]/)[0] ?? null;
    if (link && canAccessAppRoute(path, me)) {
      onClose();
      router.push(link);
    }
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="알림" width={400}
      sub={shell ? `최근 ${shell.notiWindowDays}일 · 안 읽음 ${shell.unread}건` : undefined}
      footer={(
        <Button variant="ghost" size="sm" disabled={!shell?.unread || read.isPending} onClick={() => read.mutate({ all: true })}>
          모두 읽음으로 표시
        </Button>
      )}
    >
      {notis.length === 0 ? (
        <p className="px-1 py-8 text-center text-[13px] text-fg-subtle">받은 알림이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notis.map((n) => (
            <li key={n.id}>
              <button
                type="button" onClick={() => openNoti(n.id, n.read, n.link)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left text-[13px]',
                  n.read ? 'border-line bg-card text-fg-subtle' : 'border-primary/40 bg-inset text-fg',
                )}
              >
                <span className="flex items-center gap-2">
                  {n.read ? null : <span aria-hidden className="size-2 shrink-0 rounded-full bg-red" />}
                  <Chip size="compact">{n.categoryLabel}</Chip>
                  <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">{shortAt(n.at)}</span>
                </span>
                {n.title ? <b className="text-fg">{n.title}</b> : null}
                <span className={n.title ? 'text-fg-subtle' : 'font-bold'}>{n.body}</span>
                {n.fromName ? <span className="text-[11px] text-fg-subtle">{n.fromName}</span> : null}
                <span className="sr-only">{n.read ? '읽음' : '안 읽음'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
