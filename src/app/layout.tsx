import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TACO ERP',
  description: '티엔아카데미 학원 운영 백오피스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
