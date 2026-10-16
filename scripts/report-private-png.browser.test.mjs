/** @file-guide
 * 목적: B1014-04 학부모 일별 리포트의 실제 브라우저 PNG 바이트에서 내부 메모가 빠지는지 회귀 검증한다.
 * 책임/재사용: 제품의 ReportExportPanel → downloadReportPng → html-to-image 경로를 묶고, 독립 Chrome과 임시 localhost만 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

/** 선택적 단일 실행: Back Jest가 합성 DB에 쓰고 HTTP로 읽은 상세를 제품 PNG에 연결한다. */
async function databaseHttpFixture() {
  if (process.env.B1014_DB_HTTP !== '1') return null;
  const development = new URL(process.env.DATABASE_URL || '');
  const scratch = new URL(process.env.TEST_DATABASE_URL || '');
  assert.ok(['localhost', '127.0.0.1'].includes(development.hostname) && development.port === '55494'
    && development.pathname === '/taco_dev', '승인된 localhost:55494 taco_dev만 사용한다');
  assert.ok(['localhost', '127.0.0.1'].includes(scratch.hostname) && scratch.port === '55494'
    && scratch.pathname === '/taco_dev_test', '승인된 localhost:55494 taco_dev_test만 사용한다');
  const backRoot = resolve(process.env.B1014_BACK_ROOT || join(root, '..', 'taco_office_back'));
  const directory = await mkdtemp(join(tmpdir(), 'taco-b1014-db-http-png-'));
  const fixtureFile = join(directory, 'http-detail.json');
  try {
    const result = spawnSync('npm', ['test', '--', '--runInBand', '--runTestsByPath',
      'test/reports-weekly-db.spec.ts', '-t', 'B1014-04'], {
      cwd: backRoot, encoding: 'utf8', timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JWT_SECRET: 'b1014-local-access-fixture-only-0001',
        JWT_REFRESH_SECRET: 'b1014-local-refresh-fixture-only-0002',
        B1014_REPORT_HTTP_FIXTURE_FILE: fixtureFile,
      },
    });
    assert.equal(result.status, 0, `DB→HTTP 회귀 실패:\n${result.stdout || ''}\n${result.stderr || ''}`);
    const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
    assert.equal(fixture.source, 'reports-weekly-db.spec.ts: B1014-04 DB+HTTP');
    assert.equal(fixture.dbReadback.adminNote, fixture.adminNote, '관리자 NOTE DB 재조회');
    assert.equal(fixture.dbReadback.privateNote, fixture.privateNote, '강사 특이사항 DB 재조회');
    assert.equal(fixture.fakeSenderCalls, 0, '거절 발송의 FakeSender 외부 호출 0건');
    const daily = fixture.http.detail.exportFiles.find((file) => file.studentId === fixture.studentId);
    assert.equal(daily?.plainText, fixture.http.dailyPlainText, 'HTTP 상세의 학생별 본문');
    assert.equal(fixture.http.queuedPlainText, daily.plainText, 'HTTP 발송 후보와 상세 일치');
    assert.ok(fixture.http.weeklyPlainText.includes(daily.plainText), 'HTTP 주간 본문에 일별 공개 본문 포함');
    assert.ok(!JSON.stringify(fixture.http).includes(fixture.adminNote), 'HTTP 출력에 관리자 NOTE 없음');
    assert.ok(!JSON.stringify(fixture.http).includes(fixture.privateNote), 'HTTP 출력에 강사 특이사항 없음');
    assert.equal(fixture.http.detail.formatVersion, 0, '공개 본문 변경 대조군의 legacy 양식');
    return fixture;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// 실행 중인 앱/DB와 분리된 페이지에서도 실제 제품 컴포넌트와 PNG 생성 함수를 번들한다.
const fixtureSource = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ReportExportPanel } from '@/components/report/ReportExportPanel';

const dbFixture = window.__reportHttpFixture || null;
const adminCanary = dbFixture?.adminNote ?? 'B1014관리자비공개메모CANARY';
const teacherCanary = dbFixture?.privateNote ?? 'B1014강사전용특이사항CANARY';
const staticBase = {
  id: 1, serId: 2, date: '2026-08-04', onDate: '2026-08-04', startMin: 600, endMin: 660,
  mode: 'online', subKey: 'math', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'ok',
  written: true, students: [{ id: 4, name: '검증학생', grade: '고2', deliver: true, late: false }],
  minutesSinceEnd: 0, penalty: 0,
  body: { content: '공개 수업 내용', progress: '42p', homework: '43p' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도 페이지', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 숙제 페이지', hint: '', min: 1, max: 2000 },
  ],
  formatVersion: 0, version: 1, structuredBody: null, bookOptions: [],
  canEdit: false, canReview: false, canExport: true, canDeliver: false,
  exportFiles: [{ studentId: 4, fileName: 'b1014-private-note-canary.png', plainText: '공개 수업 내용', revision: 'a'.repeat(64) }],
  subjectName: '수학', lang: 'ko', writtenAt: '2026-08-04T08:00:00Z',
  submittedAt: '2026-08-04T08:00:00Z', reviewedAt: '2026-08-04T09:00:00Z', rejectReason: null,
};
const base = dbFixture?.http.detail ?? staticBase;
const root = createRoot(document.getElementById('root'));
HTMLAnchorElement.prototype.click = function () { window.__downloadedPng = this.href; };

window.captureReport = async (variant) => {
  window.__downloadedPng = null;
  const changed = variant === 'public';
  const privateNotes = variant === 'private';
  const detail = {
    ...base,
    ...(changed ? { body: { ...base.body, content: '공개 수업 내용 변경' } } : {}),
    ...(privateNotes ? {
      comments: { items: [{ body: adminCanary }] },
      teacherPrivateNotes: [{ body: teacherCanary }],
    } : {}),
  };
  flushSync(() => root.render(React.createElement(React.Fragment, null,
    privateNotes ? React.createElement('aside', { id: 'private-notes' }, adminCanary, teacherCanary) : null,
    React.createElement(ReportExportPanel, { detail, initialStudentId: dbFixture?.studentId, showHistory: false }),
  )));
  const preview = document.querySelector('[data-testid="report-document"]');
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === 'PNG로 저장');
  if (!preview || !button) throw new Error('학부모 리포트 PNG 화면을 찾지 못했습니다: ' +
    JSON.stringify({ html: document.body.innerHTML.slice(0, 500), errors: window.__consoleErrors, error: window.__entryError }));
  button.click();
  for (let i = 0; i < 200 && !window.__downloadedPng; i += 1) {
    await new Promise((done) => setTimeout(done, 25));
  }
  if (!window.__downloadedPng) throw new Error(document.body.textContent || 'PNG 렌더 실패');
  return {
    png: window.__downloadedPng,
    privateVisibleOutsidePreview: privateNotes && document.getElementById('private-notes').textContent.includes(adminCanary)
      && document.getElementById('private-notes').textContent.includes(teacherCanary),
    previewContainsPrivate: preview.textContent.includes(adminCanary) || preview.textContent.includes(teacherCanary),
  };
};
`;

function chromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (found) return found;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [name], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome 실행 파일이 없습니다. CHROME_BIN을 지정하세요.');
}

async function devtoolsPort(profile) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const content = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      return Number(content.split('\n', 1)[0]);
    } catch {
      await pause(100);
    }
  }
  throw new Error('Chrome DevTools 포트가 10초 안에 준비되지 않았습니다');
}

async function connectDevtools(port) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find((item) => item.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome 페이지 세션을 찾지 못했습니다');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const response = JSON.parse(event.data);
    if (!response.id) return;
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error.message));
    else waiter.resolve(response.result);
  });
  return {
    socket,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(session, expression) {
  const answer = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.text || '브라우저 평가 실패');
  return answer.result.value;
}

function decodePng(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), '실제 PNG signature');
  assert.ok(bytes.length > 1000, '빈 PNG가 아닌 브라우저 출력');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width >= 300 && height >= 100, `PNG 크기 ${width}x${height}`);
  return { bytes, width, height, sha256: createHash('sha256').update(bytes).digest('hex') };
}

test('B1014-04: 실제 일별 PNG는 보이는 관리자·강사 비공개 메모의 영향을 받지 않고 공개 본문 변경은 반영한다',
  { timeout: 180_000 }, async () => {
    const httpFixture = await databaseHttpFixture();
    const built = await build({
      stdin: { contents: fixtureSource, resolveDir: root, sourcefile: 'report-private-png-entry.tsx', loader: 'tsx' },
      bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: '/fixture.js', write: false,
      alias: { '@': join(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    });
    const assets = new Map(built.outputFiles.map((file) => [basename(file.path), file.contents]));
    if (httpFixture) {
      assets.set('report-fixture.js', Buffer.from(`window.__reportHttpFixture=${JSON.stringify(httpFixture)};`));
    }
    // 수동 시각 검수 시 이미 검증한 Next build의 실제 CSS를 격리 fixture에 얹는다.
    if (process.env.B1014_PNG_USE_BUILD_CSS === '1') {
      const cssDir = join(root, '.next/static/css');
      const cssFiles = (await readdir(cssDir)).filter((name) => name.endsWith('.css')).sort();
      assert.ok(cssFiles.length > 0, '검증된 Next build CSS가 필요합니다');
      assets.set('app.css', Buffer.concat(await Promise.all(cssFiles.map((name) => readFile(join(cssDir, name))))));
    }
    const server = createServer((req, res) => {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><head><meta charset="utf-8">' +
          (assets.has('app.css') ? '<link rel="stylesheet" href="/app.css">' : '') +
          '<style>body{margin:0;background:white}#root{width:480px;padding:12px}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};window.__consoleErrors=[];const originalError=console.error;console.error=(...args)=>{window.__consoleErrors.push(args.map(String).join(" "));originalError(...args)};window.addEventListener("error", e => window.__entryError = e.message)</script>' +
          (httpFixture ? '<script src="/report-fixture.js"></script>' : '') + '<script src="/fixture.js"></script></body></html>');
        return;
      }
      const name = basename(req.url || '');
      const body = assets.get(name);
      if (!body) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(body);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const profile = await mkdtemp(join(tmpdir(), 'taco-b1014-png-'));
    const chrome = spawn(chromeBinary(), [
      '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
      '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let chromeError = '';
    chrome.stderr.on('data', (chunk) => { chromeError += String(chunk).slice(0, 1000); });
    let session;
    try {
      const port = await devtoolsPort(profile);
      session = await connectDevtools(port);
      await session.send('Page.enable');
      await session.send('Runtime.enable');
      await session.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await evaluate(session, 'typeof window.captureReport') === 'function') break;
        await pause(100);
      }
      assert.equal(await evaluate(session, 'typeof window.captureReport'), 'function',
        `제품 렌더 fixture 준비: ${await evaluate(session, 'JSON.stringify({state:document.readyState,error:window.__entryError,html:document.body.innerHTML.slice(0,200)})')}`);
      const baseline = await evaluate(session, "window.captureReport('baseline')");
      const withPrivate = await evaluate(session, "window.captureReport('private')");
      const publicChange = await evaluate(session, "window.captureReport('public')");
      assert.equal(withPrivate.privateVisibleOutsidePreview, true, '두 비공개 canary가 페이지에는 실제로 보인다');
      assert.equal(withPrivate.previewContainsPrivate, false, 'PNG 대상 DOM에는 비공개 canary가 없다');
      const basePng = decodePng(baseline.png);
      const privatePng = decodePng(withPrivate.png);
      const changedPng = decodePng(publicChange.png);
      assert.equal(privatePng.sha256, basePng.sha256, '비공개 canary는 실제 PNG 바이트를 바꾸지 않는다');
      assert.notEqual(changedPng.sha256, basePng.sha256, '공개 본문 변경은 실제 PNG 픽셀을 바꾼다');
      assert.deepEqual([privatePng.width, privatePng.height], [basePng.width, basePng.height]);
      if (httpFixture) {
        assert.ok(basePng.bytes.length > 1000, 'DB→HTTP→제품 PNG 바이트');
        process.stdout.write(`DB→HTTP→ReportExportPanel→PNG PASS: ${basePng.width}x${basePng.height}, sha256=${basePng.sha256}, private same, public changed, FakeSender=0\n`);
      }
      // 시각 검수가 필요할 때만 합성 공개 리포트 PNG를 지정한 로컬 경로에 남긴다.
      if (process.env.B1014_PNG_ARTIFACT) {
        await writeFile(process.env.B1014_PNG_ARTIFACT, basePng.bytes);
      }
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}${chromeError ? `; Chrome: ${chromeError.slice(0, 1000)}` : ''}`);
    } finally {
      session?.socket.close();
      chrome.kill();
      await new Promise((done) => server.close(done));
      if (chrome.exitCode === null) {
        await Promise.race([new Promise((done) => chrome.once('exit', done)), pause(3000)]);
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { await rm(profile, { recursive: true, force: true }); break; }
        catch (error) { if (attempt === 2) throw error; await pause(200); }
      }
    }
  });
