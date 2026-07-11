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

## 면책

본 서비스의 출력은 공시 데이터 기반 자동 생성 참고자료이며, 투자 권유가 아닙니다.
투자 판단의 책임은 이용자 본인에게 있습니다.
