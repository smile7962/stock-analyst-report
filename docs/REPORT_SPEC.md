# 리포트 목표 스펙 (Phase 0 산출물)

> 앱이 최종적으로 출력해야 하는 리포트의 형태 정의. 화면(§4.1 카드 구성)과
> 데이터 계약(백엔드 계산값 + LLM 서술)의 기준 문서다.
>
> ※ 초안 상태: claude.ai에 한국주식 MCP(korea-stock-mcp 등)를 연결해 "삼성전자
> 애널리스트 보고서" 생성 실험을 하고, 그 결과와 대조해 이 문서를 보정한다.

## 1. 리포트 데이터 계약

최종 리포트 = **백엔드 계산값**(`computed`) + **LLM 서술**(`narrative`)의 코드 병합.
LLM은 `narrative` 필드만 생성하며 수치·투자의견을 출력하지 않는다.

```jsonc
{
  "meta": {
    "stockCode": "005930",
    "corpName": "삼성전자",
    "generatedAt": "2026-07-11T09:00:00+09:00",
    "dataAsOf": { "financials": "2026Q1", "price": "2026-07-10" },
    "methodology": "멀티플(시나리오 3밴드) + RIM 가중평균",   // 업종별 분기 결과
    "assumptions": { "requiredReturn": 0.09, "growthScenarios": [0.02, 0.05, 0.08] }
  },
  "computed": {                       // ← 전부 코드가 계산. LLM 관여 금지
    "price": { "current": 0, "change": 0, "changePct": 0, "high52w": 0, "low52w": 0, "marketCap": 0 },
    "opinion": "매수 | 중립 | 매도",   // 규칙: 기본밴드 상승여력 ±15%
    "targetPrice": { "conservative": 0, "base": 0, "optimistic": 0 },
    "upsidePct": 0,                    // 기본 밴드 기준
    "financials": [                    // 3~5개년 + 최근 분기
      { "period": "2025", "revenue": 0, "operatingProfit": 0, "netIncome": 0, "revenueYoY": 0, "opYoY": 0 }
    ],
    "ratios": { "per": 0, "pbr": 0, "roe": 0, "opMargin": 0, "debtRatio": 0, "divYield": 0 },
    "peers": [                         // 업종 동일 + 시총 0.2~5배, 3~5개사
      { "name": "", "stockCode": "", "per": 0, "pbr": 0, "marketCap": 0 }
    ],
    "priceHistory": [{ "date": "", "close": 0 }]   // 1년 일별
  },
  "narrative": {                      // ← LLM 생성 (tool use 스키마 강제, 수치 검증기 통과 필수)
    "summary": ["핵심 논거 1", "핵심 논거 2", "핵심 논거 3"],
    "business": "기업/사업모델 2~3문장",
    "earningsComment": "실적 추이 해석 3~4문장",
    "valuationComment": "목표주가 산출 논리 서술 3~4문장 (방법론·가정 언급)",
    "strengths": ["강점 1", "강점 2", "강점 3"],
    "risks": ["리스크 1", "리스크 2", "리스크 3"],
    "analystView": "종합 의견 4~5문장"
  }
}
```

## 2. 화면 매핑 (모바일 1열 카드 스크롤)

| 순서 | 카드 | 사용 필드 |
|---|---|---|
| 1 | 헤더 | meta.corpName, computed.price, computed.opinion, computed.targetPrice.base, computed.upsidePct |
| 2 | 투자 요약 | narrative.summary |
| 3 | 주가 차트 (1Y) | computed.priceHistory |
| 4 | 실적 테이블 | computed.financials |
| 5 | 밸류에이션 | computed.targetPrice(3밴드), meta.methodology, meta.assumptions, computed.peers, narrative.valuationComment |
| 6 | 강점 · 리스크 | narrative.strengths, narrative.risks |
| 7 | 애널리스트 코멘트 | narrative.business, narrative.earningsComment, narrative.analystView |
| 8 | 면책 고지 (고정) | 고정 문구 |

## 3. 품질 기준

- 수치 없는 항목은 지어내지 않고 "자료 없음" 표기
- 강점·리스크 동등 비중 (매수 일변도 금지)
- 적자기업: 목표주가 미제시 + 사유 표기
- 생성 소요 10~30초 → 단계별 진행 표시 ("재무 수집" → "밸류에이션" → "작성")
- 색상: 상승 빨강 / 하락 파랑, 다크모드 대응
