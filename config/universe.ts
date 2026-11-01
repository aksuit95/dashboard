/**
 * 심볼, 영수증 배수, 비교 쌍은 이 파일에만 둔다.
 * sharesPerReceipt = 상장 증권 1장이 나타내는 보통주 수.
 * SKHY 1 ADS = 보통주 1/10 이므로 0.1. 삼성 런던 GDR 은 25.
 */

export type QuoteCurrency = "USD" | "KRW" | "EUR" | "JPY" | "POINTS" | "PERCENT";
export type InstrumentSource = "yahoo" | "hyperliquid";
export type SessionKind = "rth" | "always";
export type BoardGroup = "adr" | "perp" | "futures" | "macro" | "gdr" | "etf" | "krx" | "index";
export type InstrumentKind =
  | "equity"
  | "adr"
  | "gdr"
  | "perp"
  | "future"
  | "fx"
  | "etf"
  | "index"
  | "macro";
export type InstrumentClass = "equity" | "etf" | "etn" | "reit" | "spac" | "index" | "fx" | "future" | "macro";
export type MoverMarket = "KOSPI" | "KOSDAQ" | "US";

export type ReceiptEvent = {
  effective: string;
  sharesPerReceipt: number;
};

export type InstrumentConfig = {
  id: string;
  symbol: string;
  name: string;
  venue: string;
  source: InstrumentSource;
  currency: QuoteCurrency;
  kind: InstrumentKind;
  instrumentClass: InstrumentClass;
  sharesPerReceipt: number;
  receiptSchedule?: ReceiptEvent[];
  session: SessionKind;
  group: BoardGroup;
  active: boolean;
  history: boolean;
  /** 프리미엄 분모 종목 id */
  baseId?: string;
  moverMarket?: MoverMarket;
  /** 카드에 항상 붙는 설명 */
  note?: string;
};

export type McapPair = {
  id: string;
  name: string;
  numeratorIds: string[];
  denominatorIds: string[];
};

export type EtfGroup = {
  id: string;
  name: string;
  instrumentIds: string[];
};

const equity = (
  partial: Pick<InstrumentConfig, "id" | "symbol" | "name" | "moverMarket"> &
    Partial<InstrumentConfig>,
): InstrumentConfig => ({
  venue: partial.moverMarket === "US" ? "US" : "KRX",
  source: "yahoo",
  currency: partial.moverMarket === "US" ? "USD" : "KRW",
  kind: "equity",
  instrumentClass: "equity",
  sharesPerReceipt: 1,
  session: "rth",
  group: "krx",
  active: true,
  history: true,
  ...partial,
});

export const instruments: InstrumentConfig[] = [
  equity({ id: "005930.KS", symbol: "005930.KS", name: "삼성전자", moverMarket: "KOSPI" }),
  equity({ id: "005935.KS", symbol: "005935.KS", name: "삼성전자우", moverMarket: "KOSPI" }),
  equity({ id: "000660.KS", symbol: "000660.KS", name: "SK하이닉스", moverMarket: "KOSPI" }),
  equity({ id: "005380.KS", symbol: "005380.KS", name: "현대차", moverMarket: "KOSPI" }),
  equity({ id: "009150.KS", symbol: "009150.KS", name: "삼성전기", moverMarket: "KOSPI" }),
  equity({ id: "000270.KS", symbol: "000270.KS", name: "기아", moverMarket: "KOSPI" }),
  equity({ id: "068270.KS", symbol: "068270.KS", name: "셀트리온", moverMarket: "KOSPI" }),
  equity({ id: "035420.KS", symbol: "035420.KS", name: "NAVER", moverMarket: "KOSPI" }),
  equity({ id: "247540.KQ", symbol: "247540.KQ", name: "에코프로비엠", moverMarket: "KOSDAQ" }),
  equity({ id: "086520.KQ", symbol: "086520.KQ", name: "에코프로", moverMarket: "KOSDAQ" }),

  equity({ id: "MU", symbol: "MU", name: "Micron", moverMarket: "US", venue: "Nasdaq" }),
  equity({ id: "TSM", symbol: "TSM", name: "TSMC", moverMarket: "US", venue: "NYSE" }),
  equity({ id: "NVDA", symbol: "NVDA", name: "NVIDIA", moverMarket: "US", venue: "Nasdaq" }),
  equity({ id: "AVGO", symbol: "AVGO", name: "Broadcom", moverMarket: "US", venue: "Nasdaq" }),
  equity({ id: "AMD", symbol: "AMD", name: "AMD", moverMarket: "US", venue: "Nasdaq" }),
  equity({ id: "AAPL", symbol: "AAPL", name: "Apple", moverMarket: "US", venue: "Nasdaq" }),
  equity({ id: "MSFT", symbol: "MSFT", name: "Microsoft", moverMarket: "US", venue: "Nasdaq" }),
  {
    id: "6981.T",
    symbol: "6981.T",
    name: "Murata",
    venue: "TSE",
    source: "yahoo",
    currency: "JPY",
    kind: "equity",
    instrumentClass: "equity",
    sharesPerReceipt: 1,
    session: "rth",
    group: "krx",
    active: true,
    history: true,
  },
  {
    id: "4062.T",
    symbol: "4062.T",
    name: "Ibiden",
    venue: "TSE",
    source: "yahoo",
    currency: "JPY",
    kind: "equity",
    instrumentClass: "equity",
    sharesPerReceipt: 1,
    session: "rth",
    group: "krx",
    active: true,
    history: true,
  },

  {
    id: "SKHY",
    symbol: "SKHY",
    name: "SK하이닉스 나스닥 ADR",
    venue: "Nasdaq",
    source: "yahoo",
    currency: "USD",
    kind: "adr",
    instrumentClass: "equity",
    sharesPerReceipt: 0.1,
    session: "rth",
    group: "adr",
    active: true,
    history: false,
    baseId: "000660.KS",
    note: "1 ADS = 보통주 1/10 · 1주 환산가",
  },
  {
    id: "SMSN.IL",
    symbol: "SMSN.IL",
    name: "삼성전자 런던 GDR",
    venue: "LSE IOB",
    source: "yahoo",
    currency: "USD",
    kind: "gdr",
    instrumentClass: "equity",
    sharesPerReceipt: 25,
    session: "rth",
    group: "gdr",
    active: true,
    history: false,
    baseId: "005930.KS",
    note: "1 GDR = 보통주 25주 · 1주 환산가",
  },
  {
    id: "HY9H.F",
    symbol: "HY9H.F",
    name: "SK하이닉스 프랑크푸르트",
    venue: "Frankfurt",
    source: "yahoo",
    currency: "EUR",
    kind: "gdr",
    instrumentClass: "equity",
    sharesPerReceipt: 1,
    session: "rth",
    group: "gdr",
    active: true,
    history: false,
    baseId: "000660.KS",
    note: "1주 가격",
  },

  {
    id: "xyz:SMSN",
    symbol: "xyz:SMSN",
    name: "삼성전자 PERP",
    venue: "Hyperliquid",
    source: "hyperliquid",
    currency: "USD",
    kind: "perp",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "perp",
    active: true,
    history: false,
    baseId: "005930.KS",
  },
  {
    id: "xyz:SKHX",
    symbol: "xyz:SKHX",
    name: "SK하이닉스 PERP",
    venue: "Hyperliquid",
    source: "hyperliquid",
    currency: "USD",
    kind: "perp",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "perp",
    active: true,
    history: false,
    baseId: "000660.KS",
  },
  {
    id: "xyz:SKHY",
    symbol: "xyz:SKHY",
    name: "SK하이닉스 ADR PERP",
    venue: "Hyperliquid",
    source: "hyperliquid",
    currency: "USD",
    kind: "perp",
    instrumentClass: "future",
    sharesPerReceipt: 0.1,
    session: "always",
    group: "perp",
    active: true,
    history: false,
    baseId: "000660.KS",
    note: "1주 환산가",
  },
  {
    id: "xyz:HYUNDAI",
    symbol: "xyz:HYUNDAI",
    name: "현대차 PERP",
    venue: "Hyperliquid",
    source: "hyperliquid",
    currency: "USD",
    kind: "perp",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "perp",
    active: true,
    history: false,
    baseId: "005380.KS",
  },
  {
    id: "xyz:KR200",
    symbol: "xyz:KR200",
    name: "KOSPI200 PERP",
    venue: "Hyperliquid",
    source: "hyperliquid",
    currency: "POINTS",
    kind: "perp",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "perp",
    active: true,
    history: false,
    baseId: "^KS200",
  },

  {
    id: "NQ=F",
    symbol: "NQ=F",
    name: "나스닥 100 선물",
    venue: "CME",
    source: "yahoo",
    currency: "POINTS",
    kind: "future",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "futures",
    active: true,
    history: false,
  },
  {
    id: "ES=F",
    symbol: "ES=F",
    name: "S&P 500 선물",
    venue: "CME",
    source: "yahoo",
    currency: "POINTS",
    kind: "future",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "futures",
    active: true,
    history: false,
  },
  {
    id: "CL=F",
    symbol: "CL=F",
    name: "WTI",
    venue: "NYMEX",
    source: "yahoo",
    currency: "USD",
    kind: "future",
    instrumentClass: "future",
    sharesPerReceipt: 1,
    session: "always",
    group: "macro",
    active: true,
    history: false,
  },
  {
    id: "^TNX",
    symbol: "^TNX",
    name: "미국 10년물 금리",
    venue: "CBOE",
    source: "yahoo",
    currency: "PERCENT",
    kind: "macro",
    instrumentClass: "macro",
    sharesPerReceipt: 1,
    session: "rth",
    group: "macro",
    active: true,
    history: false,
  },
  {
    id: "2YY=F",
    symbol: "2YY=F",
    name: "미국 2년 금리 선물",
    venue: "CBOT",
    source: "yahoo",
    currency: "PERCENT",
    kind: "macro",
    instrumentClass: "macro",
    sharesPerReceipt: 1,
    session: "always",
    group: "macro",
    active: true,
    history: false,
    note: "현물 2년물이 아니라 2년 금리 선물 가격입니다.",
  },
  {
    id: "^VIX",
    symbol: "^VIX",
    name: "VIX",
    venue: "CBOE",
    source: "yahoo",
    currency: "POINTS",
    kind: "macro",
    instrumentClass: "macro",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
  {
    id: "^SOX",
    symbol: "^SOX",
    name: "필라델피아 반도체",
    venue: "NASDAQ",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
    note: "챗봇과 같은 야후 차트 심볼 ^SOX",
  },

  {
    id: "KRW=X",
    symbol: "KRW=X",
    name: "USD/KRW",
    venue: "FX",
    source: "yahoo",
    currency: "KRW",
    kind: "fx",
    instrumentClass: "fx",
    sharesPerReceipt: 1,
    session: "always",
    group: "macro",
    active: true,
    history: true,
  },
  {
    id: "EURKRW=X",
    symbol: "EURKRW=X",
    name: "EUR/KRW",
    venue: "FX",
    source: "yahoo",
    currency: "KRW",
    kind: "fx",
    instrumentClass: "fx",
    sharesPerReceipt: 1,
    session: "always",
    group: "macro",
    active: true,
    history: true,
  },
  {
    id: "JPY=X",
    symbol: "JPY=X",
    name: "USD/JPY",
    venue: "FX",
    source: "yahoo",
    currency: "JPY",
    kind: "fx",
    instrumentClass: "fx",
    sharesPerReceipt: 1,
    session: "always",
    group: "macro",
    active: true,
    history: true,
  },

  {
    id: "DRAM",
    symbol: "DRAM",
    name: "Roundhill Memory ETF",
    venue: "Nasdaq",
    source: "yahoo",
    currency: "USD",
    kind: "etf",
    instrumentClass: "etf",
    sharesPerReceipt: 1,
    session: "rth",
    group: "etf",
    active: true,
    history: true,
  },
  {
    id: "EWY",
    symbol: "EWY",
    name: "iShares MSCI Korea ETF",
    venue: "NYSE Arca",
    source: "yahoo",
    currency: "USD",
    kind: "etf",
    instrumentClass: "etf",
    sharesPerReceipt: 1,
    session: "rth",
    group: "etf",
    active: true,
    history: true,
  },
  {
    id: "SOXX",
    symbol: "SOXX",
    name: "iShares Semiconductor ETF",
    venue: "Nasdaq",
    source: "yahoo",
    currency: "USD",
    kind: "etf",
    instrumentClass: "etf",
    sharesPerReceipt: 1,
    session: "rth",
    group: "etf",
    active: true,
    history: true,
  },
  {
    id: "091160.KS",
    symbol: "091160.KS",
    name: "KODEX 반도체",
    venue: "KRX",
    source: "yahoo",
    currency: "KRW",
    kind: "etf",
    instrumentClass: "etf",
    sharesPerReceipt: 1,
    session: "rth",
    group: "krx",
    active: true,
    history: true,
  },

  {
    id: "^KS11",
    symbol: "^KS11",
    name: "KOSPI",
    venue: "KRX",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
  {
    id: "^KQ11",
    symbol: "^KQ11",
    name: "KOSDAQ",
    venue: "KRX",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
  {
    id: "^KS200",
    symbol: "^KS200",
    name: "KOSPI200",
    venue: "KRX",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
  {
    id: "^GSPC",
    symbol: "^GSPC",
    name: "S&P 500",
    venue: "S&P",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
  {
    id: "^IXIC",
    symbol: "^IXIC",
    name: "NASDAQ",
    venue: "Nasdaq",
    source: "yahoo",
    currency: "POINTS",
    kind: "index",
    instrumentClass: "index",
    sharesPerReceipt: 1,
    session: "rth",
    group: "index",
    active: true,
    history: true,
  },
];

export const boardSections: { id: BoardGroup; title: string; description: string }[] = [
  {
    id: "adr",
    title: "ADR",
    description: "보통주 1주 기준으로 환산한 가격과 KRX 대비 프리미엄",
  },
  {
    id: "perp",
    title: "DEX 무기한선물",
    description: "Hyperliquid 표시 가격. 8시간 펀딩은 시간당 펀딩 × 8",
  },
  {
    id: "futures",
    title: "글로벌 선물",
    description: "미국 지수 선물",
  },
  {
    id: "macro",
    title: "매크로",
    description: "금리, 원유, 환율",
  },
  {
    id: "gdr",
    title: "GDR · 해외 상장",
    description: "런던 · 프랑크푸르트. 카드 부제의 배수로 1주를 맞춥니다.",
  },
  {
    id: "etf",
    title: "미국 ETF 프록시",
    description: "한국·메모리·반도체를 따라가는 미국 상장 ETF",
  },
];

export const krxReferenceIds = ["005930.KS", "000660.KS", "005380.KS", "^KS200"];

export const mcapPairs: McapPair[] = [
  {
    id: "skh-sec-pref",
    name: "SK하이닉스 / (삼성전자 + 삼성전자우)",
    numeratorIds: ["000660.KS"],
    denominatorIds: ["005930.KS", "005935.KS"],
  },
  {
    id: "skh-sec",
    name: "SK하이닉스 / 삼성전자",
    numeratorIds: ["000660.KS"],
    denominatorIds: ["005930.KS"],
  },
  {
    id: "skh-mu",
    name: "SK하이닉스 / Micron",
    numeratorIds: ["000660.KS"],
    denominatorIds: ["MU"],
  },
  {
    id: "sem-murata",
    name: "삼성전기 / Murata",
    numeratorIds: ["009150.KS"],
    denominatorIds: ["6981.T"],
  },
  {
    id: "sem-murata-ibiden",
    name: "삼성전기 / (Murata + Ibiden)",
    numeratorIds: ["009150.KS"],
    denominatorIds: ["6981.T", "4062.T"],
  },
  {
    id: "sec-tsm",
    name: "삼성전자 / TSMC",
    numeratorIds: ["005930.KS"],
    denominatorIds: ["TSM"],
  },
  {
    id: "avgo-nvda",
    name: "Broadcom / NVIDIA",
    numeratorIds: ["AVGO"],
    denominatorIds: ["NVDA"],
  },
];

export const etfGroups: EtfGroup[] = [
  { id: "us", name: "미국 ETF", instrumentIds: ["DRAM", "EWY", "SOXX"] },
  { id: "semi", name: "반도체", instrumentIds: ["091160.KS"] },
];

export const annualReturnIds = ["^GSPC", "^IXIC", "^KS11", "^KQ11"];
export const disparityIds = ["^KS11", "^KQ11"];

export const fxIds = {
  usdkrw: "KRW=X",
  eurkrw: "EURKRW=X",
  usdjpy: "JPY=X",
} as const;

export function activeInstruments(): InstrumentConfig[] {
  return instruments.filter((item) => item.active);
}

export function instrumentById(id: string): InstrumentConfig | undefined {
  return instruments.find((item) => item.id === id);
}

export const KRW_CAP_FLOOR = 100_000_000_000;
export const USD_CAP_FLOOR = 1_000_000_000;
export const ADR_WINDOW = 20;
export const WEEK_HIGH_SESSIONS = 252;
