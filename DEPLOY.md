# 배포 · 스마트폰에서 사용하기

개인용 앱을 스마트폰에서 쓰기 위한 안내다. 핵심 제약을 먼저 이해하고 방식을 고른다.

## ⚠️ 먼저 알아둘 것: 첫 리포트는 2~3분 걸린다

리포트 생성은 KRX에서 52주 시세를 일자별로 모으느라 **첫 조회 시 2~3분**이 걸린다(같은 종목
재조회는 캐시로 즉시). 이 시간이 배포 방식 선택을 좌우한다.

- **서버리스(Vercel·Netlify의 함수)는 부적합.** 함수 실행 시간 제한(무료 10~60초)이 리포트
  생성 시간보다 짧아 **요청이 타임아웃**된다. 정적 페이지·검색은 되지만 리포트가 안 나온다.
- **타임아웃 없는 지속형 Node 서버(`next start`)를 쓴다.** 아래 두 방식 모두 이에 해당한다.

## 필요한 환경 변수

| 키 | 빌드 | 런타임 | 발급처 |
|---|---|---|---|
| `DART_API_KEY` | ✅(종목 마스터 생성) | ✅ | opendart.fss.or.kr |
| `KRX_OPENAPI_KEY` | — | ✅ | openapi.krx.co.kr |
| `GEMINI_API_KEY` | — | ✅ | aistudio.google.com |

`npm run build` 는 `prebuild` 에서 종목 마스터를 준비한다(30일 이내 최신본이 있으면 생략,
없으면 `DART_API_KEY` 로 내려받음). 따라서 **빌드 환경에도 `DART_API_KEY` 가 있어야** 한다.

---

## 방식 A — 자체 호스팅 (개인용 권장)

집의 항상 켜져 있는 컴퓨터(맥·PC·라즈베리파이 등)에서 돌리고 폰으로 접속한다. 클라우드 계정이
필요 없고 API 키가 내 기기 밖으로 나가지 않는다.

```bash
npm install
cp .env.example .env.local     # 세 키 입력
npm run build
npm start                       # 기본 3000 포트, 타임아웃 없음
```

폰에서 접속:
- **같은 Wi-Fi**: 폰 브라우저에서 `http://<컴퓨터_로컬IP>:3000` (예: `http://192.168.0.10:3000`).
  컴퓨터 IP는 macOS `ipconfig getifaddr en0`, Windows `ipconfig` 로 확인.
- **외부에서도**: 무료 터널을 쓴다 — [Tailscale](https://tailscale.com)(내 기기끼리 사설망,
  가장 간단·안전) 또는 [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
  둘 다 HTTPS 주소를 주므로 아래 PWA 설치도 된다.

## 방식 B — 관리형 지속 서버 (Railway · Render · Fly.io)

GitHub 저장소를 연결해 배포한다. 서버리스가 아닌 **상시 실행 컨테이너**라 긴 요청이 가능하다.

1. Railway/Render/Fly.io 에 저장소 연결.
2. 빌드 커맨드 `npm run build`, 시작 커맨드 `npm start` (대부분 자동 감지).
3. 환경 변수 3개(위 표) 등록 — 빌드·런타임 모두에서 보이도록.
4. (Render 예) 인스턴스가 잠들지 않게 유지하거나, 첫 요청 지연을 감안.

> Vercel 을 굳이 쓰려면 리포트 라우트를 백그라운드 작업/캐시 예열로 바꿔 요청을 60초 안에
> 끝내도록 재설계해야 한다(현재 구조로는 타임아웃). 개인용이면 방식 A/B 가 훨씬 간단하다.

---

## 폰 홈 화면에 설치 (PWA)

HTTPS 주소로 접속한 뒤:
- **iOS Safari**: 공유 → "홈 화면에 추가".
- **Android Chrome**: 메뉴(⋮) → "앱 설치" 또는 "홈 화면에 추가".

설치하면 주소창 없이 앱처럼 열린다.

---

## 실사용 참고

- **KOSDAQ 종목을 쓰려면 KRX에서 추가 신청이 필요하다.** 현재 KRX 키는 유가증권(KOSPI)
  일별매매정보만 승인돼 있어 KOSDAQ/KONEX 종목은 조회되지 않는다(조회 시 "미승인 시장"
  오류). openapi.krx.co.kr 에서 KOSDAQ 일별매매정보 API 사용을 추가 신청하면 코드 변경 없이
  바로 동작한다.
- 첫 조회 2~3분, 같은 종목 재조회는 즉시(캐시). 캐시는 서버 인스턴스별·휘발성이라 재시작 시 비워진다.
- 리포트는 투자 권유가 아닌 참고자료다(모든 화면·PDF에 면책 표기).
