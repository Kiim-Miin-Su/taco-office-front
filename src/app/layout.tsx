import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

/**
 * Pretendard — **파일을 같이 배포한다.** CDN 을 타지 않는 이유:
 *   ① 첫 화면에서 글자가 한 번 바뀌는 깜빡임(FOUT)이 없다
 *   ② 남의 서버가 죽어도 우리 화면은 멀쩡하다
 *   ③ 학생 이름이 보이는 백오피스라 외부로 나가는 요청을 하나라도 줄인다
 *
 * 가변 폰트라 굵기를 45~920 사이에서 **파일 하나로** 다 쓴다.
 * 변수 이름은 `--f-pretendard` 이고, 실제로 화면이 읽는 `--f-sans` 는
 * `styles/tokens.css` 가 이것을 대체 스택 앞에 붙여 만든다 — 글꼴의 출처도 토큰 파일 하나다.
 */
const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  display: 'swap',
  weight: '45 920',
  variable: '--f-pretendard',
});

export const metadata: Metadata = {
  title: 'TACO ERP',
  description: '티엔아카데미 학원 운영 백오피스',
  /**
   * 브라우저 탭 아이콘도 **같은 파일**을 본다 (`public/tn-mark.svg`).
   * `app/icon.svg` 를 따로 두면 로고를 바꿀 때 두 군데를 고쳐야 하고 한 군데는 빠진다.
   */
  icons: { icon: '/tn-mark.svg', apple: '/tn-mark.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
