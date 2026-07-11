import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 — 홈화면 설치 지원 (DEVELOPMENT_PLAN §4.1).
 * Next.js가 /manifest.webmanifest 로 서빙한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "주식 애널리스트 리포트",
    short_name: "애널리스트리포트",
    description: "DART 공시·KRX 시세 기반 자동 생성 종목 리포트 (투자 권유 아님, 참고자료)",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ko",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
