/**
 * 시세 데이터 제공자 추상화.
 *
 * 2단계 전략(DEVELOPMENT_PLAN §2.2)에 따라 인터페이스로 고정한다:
 *  - 프로토타입(Phase 1~4): KrxMarketClient (lib/krx.ts, 정보데이터시스템 비공식 JSON)
 *  - 운영(Phase 6): KRX 공식 Open API 구현체로 교체 — 이 인터페이스만 유지하면 된다
 */
import type { DailyPrice, MarketSnapshot } from "./types";

export interface MarketDataClient {
  /**
   * 일별 시세(OHLCV). 날짜 형식 YYYYMMDD, 결과는 날짜 오름차순.
   */
  fetchDailyPrices(
    stockCode: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyPrice[]>;

  /** 최신 거래일 기준 스냅샷: 현재가·시총·52주 밴드·업종분류 */
  fetchSnapshot(stockCode: string): Promise<MarketSnapshot>;
}
