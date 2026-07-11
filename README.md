# 주식 애널리스트 리포트

종목명을 입력하면 DART 공시·KRX 시세 데이터를 기반으로 애널리스트 수준의
종목 리포트를 생성하는 모바일 웹앱.

- 개발 계획: [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)
- 리포트 목표 스펙: [docs/REPORT_SPEC.md](./docs/REPORT_SPEC.md)
- 코딩 에이전트 지침: [CLAUDE.md](./CLAUDE.md)

## 시작하기

```bash
npm install
cp .env.example .env.local   # 발급받은 키 입력
npm run master               # 종목 마스터 생성 (DART_API_KEY 필요)
npm run dev                  # http://localhost:3000
```

## 환경 변수

| 키 | 용도 | 발급처 |
|---|---|---|
| `DART_API_KEY` | 재무·기업개황·종목 마스터 | opendart.fss.or.kr |
| `KRX_OPENAPI_KEY` | 시세(OHLCV·시총·52주) | openapi.krx.co.kr |
| `GEMINI_API_KEY` | 리포트 서술 생성 | aistudio.google.com |

키는 서버 측에서만 사용하며 클라이언트 번들에 노출되지 않는다. `.env.local` 은 커밋하지 않는다.

## 배포

- 종목 마스터(`data/stock-master.json`)는 `.gitignore` 대상이라 배포 산출물에 포함되지 않는다.
  `build` 실행 시 `prebuild` 가 마스터를 준비한다: 30일 이내 최신본이 있으면 생략, 없으면
  `DART_API_KEY` 로 새로 내려받는다. 따라서 **빌드 환경에도 `DART_API_KEY` 를 설정**해야 한다
  (마스터가 없고 키도 없으면 빌드가 실패한다).
- 런타임에는 세 키가 모두 필요하다.
- 인메모리 캐시는 서버 인스턴스별·휘발성이다. 다중 인스턴스 운영 시 공유 캐시(Upstash 등)로
  `lib/cache.ts` 를 교체한다.

## 면책

본 서비스의 출력은 공시 데이터 기반 자동 생성 참고자료이며, 투자 권유가 아닙니다.
투자 판단의 책임은 이용자 본인에게 있습니다.
