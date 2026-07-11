import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "주식 애널리스트 리포트",
  description:
    "종목명을 입력하면 공시 데이터 기반의 애널리스트 리포트를 생성합니다. 본 서비스의 출력은 투자 권유가 아닌 참고자료입니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
