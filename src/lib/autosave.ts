/** @file-guide
 * 목적: autosave.ts — draftKey, readDraft, writeDraft, clearDraft, clearAllDrafts, useDraftAutosave, useLastAutosave, autosaveTimeLabel, autosaveStampLabel (util)
 * 책임/재사용: N-69 채택(W11) — 쓰던 글을 **이 브라우저에만** 자동으로 남긴다(서버 쓰기 0). 키 = 사용자 · 대상. 제출본 · 바뀐 서버 글은 덮지 않는다.
 *   로그아웃(세션 경계)에서 `clearSessionQueries` 가 `clearAllDrafts` 를 부른다. 저장소 접근은 전부 try/catch(사생활 모드 · 막힌 저장소).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * N-69 채택(대표 위임 2026-09-26 · W11) — 「① 브라우저에만 자동 저장 · 키 = 사용자·대상(회차/보고) · 제출본 덮어쓰기 금지 ·
 * 머리줄에 「자동 저장됨 · HH:MM」 · 로그아웃 때 비움」.
 *
 * - **서버에 쓰지 않는다.** 같은 기계 · 같은 브라우저에서만 돌아온다(임시 저장 · 제출은 지금처럼 사람이 누른다).
 * - **덮지 않는다.** 초안마다 「어느 서버 글에서 시작했는가」(`base`)를 함께 둔다 — 다시 열었을 때 서버 글이 그새 바뀌었으면
 *   (다른 사람이 썼다 · 제출됐다 · 결재됐다) 되살리지 않고 지운다. 쓸 수 없는 글(`enabled=false`)이면 그 초안도 지운다.
 * - **사용자마다 따로다.** 키에 사용자 id 가 든다 — 같은 브라우저를 쓰는 다른 사람의 초안이 섞이지 않고, 로그아웃이 전부 비운다.
 */
const PREFIX = 'taco:draft:v1:';

export type DraftKind = 'report' | 'exec-memo';

export function draftKey(userId: number, kind: DraftKind, target: string): string {
  return `${PREFIX}${userId}:${kind}:${target}`;
}

interface DraftRecord<T> {
  value: T;
  base: string;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDraft<T>(key: string): DraftRecord<T> | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftRecord<T>>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.base !== 'string' || typeof parsed.savedAt !== 'number') return null;
    return parsed as DraftRecord<T>;
  } catch {
    return null;
  }
}

/* ── 머리줄 「자동 저장됨 · HH:MM」 — 마지막으로 남긴 시각 하나를 구독한다 ─────────────── */
let lastSavedAt: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function writeDraft<T>(key: string, value: T, base: string, now: number = Date.now()): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify({ value, base, savedAt: now } satisfies DraftRecord<T>));
    lastSavedAt = now;
    emit();
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* 막힌 저장소 — 지울 것도 없다 */
  }
}

/** 세션 경계(로그아웃 · 계정 전환 · 만료)에서 이 브라우저의 초안을 전부 지운다 */
export function clearAllDrafts(): void {
  try {
    const store = storage();
    if (store) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((key) => store.removeItem(key));
    }
  } catch {
    /* 막힌 저장소 */
  }
  lastSavedAt = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 마지막 자동 저장 시각(ms) — 없으면 null */
export function useLastAutosave(): number | null {
  return useSyncExternalStore(subscribe, () => lastSavedAt, () => null);
}

/**
 * 한 입력의 자동 저장 — `key` 는 사용자 · 대상(모르면 null · 아무것도 안 한다), `base` 는 그 입력이 시작한 서버 글의 지문.
 * 처음 한 번 저장된 초안을 찾아 `base` 가 같으면 `onRestore` 로 돌려준다(다르면 지운다). 그 뒤로 `dirty` 인 동안 `delayMs` 뒤에 남기고,
 * 서버 글과 같아지면(저장 · 제출 성공 · 되돌림) 지운다. `restoredAt` 은 되살린 초안이 남겨진 시각(ms)이다.
 */
export function useDraftAutosave<T>({
  key, base, value, dirty, enabled, onRestore, delayMs = 800,
}: {
  key: string | null;
  base: string;
  value: T;
  dirty: boolean;
  enabled: boolean;
  onRestore: (value: T) => void;
  delayMs?: number;
}): { restoredAt: number | null; discard: () => void } {
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const checked = useRef<string | null>(null);
  /** 되살린 그 렌더는 입력이 아직 옛 값이다 — 한 번은 지우지도 남기지도 않는다 */
  const skipOnce = useRef(false);
  /** 마지막으로 남긴(또는 되살린) 글 — 같은 글을 시각만 바꿔 다시 남기지 않는다 */
  const lastJson = useRef<string | null>(null);
  const restore = useRef(onRestore);
  restore.current = onRestore;

  // 처음 한 번 — 같은 서버 글에서 시작한 초안이면 되살리고, 아니면(바뀐 글 · 쓸 수 없는 글) 지운다
  useEffect(() => {
    if (!key) return;
    if (!enabled) { clearDraft(key); checked.current = key; lastJson.current = null; return; }
    if (checked.current === key) return;
    checked.current = key;
    lastJson.current = null;
    setRestoredAt(null);
    const stored = readDraft<T>(key);
    if (!stored) return;
    if (stored.base !== base) { clearDraft(key); return; }
    skipOnce.current = true;
    lastJson.current = JSON.stringify(stored.value);
    setRestoredAt(stored.savedAt);
    // 새 탭은 모듈 기억이 비어 머리줄이 「—」다 — 되살린 초안의 시각을 올린다(N-141 「마지막 저장 시각이 표시된다」 · all160 2026-09-30)
    if (lastSavedAt === null || stored.savedAt > lastSavedAt) { lastSavedAt = stored.savedAt; emit(); }
    restore.current(stored.value);
  }, [key, base, enabled]);

  // 쓰는 동안 — 잠깐 멈추면 남긴다 · 서버 글과 같아지면 지운다
  useEffect(() => {
    if (!key || !enabled || checked.current !== key) return undefined;
    if (skipOnce.current) { skipOnce.current = false; return undefined; }
    if (!dirty) { clearDraft(key); lastJson.current = null; return undefined; }
    const json = JSON.stringify(value);
    if (json === lastJson.current) return undefined;
    const timer = setTimeout(() => { if (writeDraft(key, value, base)) lastJson.current = json; }, delayMs);
    return () => clearTimeout(timer);
  }, [key, enabled, dirty, value, base, delayMs]);

  return {
    restoredAt,
    discard: () => { if (key) clearDraft(key); lastJson.current = null; setRestoredAt(null); },
  };
}

const kstParts = (at: number) => {
  const kst = new Date(at + 9 * 3600 * 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  return { day: `${two(kst.getUTCMonth() + 1)}-${two(kst.getUTCDate())}`, time: `${two(kst.getUTCHours())}:${two(kst.getUTCMinutes())}` };
};

/** 「자동 저장됨 · HH:MM」의 시각 — KST 벽시계(화면의 다른 시각과 같다) */
export function autosaveTimeLabel(at: number | null): string {
  return at === null ? '—' : kstParts(at).time;
}

/** 되살린 초안의 시각 — 오늘(KST)이면 「HH:MM」, 아니면 「MM-DD HH:MM」 */
export function autosaveStampLabel(at: number, now: number = Date.now()): string {
  const saved = kstParts(at);
  return saved.day === kstParts(now).day ? saved.time : `${saved.day} ${saved.time}`;
}
