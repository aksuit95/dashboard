/** 글로벌 프록시 보드에 올리는 한국 주식. 심볼은 각 거래소 표기를 그대로 쓴다. */

export type ProxyVenue = "naver" | "binance" | "hyperliquid";
export type ProxyRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export type ProxyNameConfig = {
  id: string;
  name: string;
  code: string;
  binanceSymbol: string;
  hyperliquidCoin: string;
};

export const proxyNames: ProxyNameConfig[] = [
  {
    id: "005930",
    name: "삼성전자",
    code: "005930",
    binanceSymbol: "SAMSUNGUSDT",
    hyperliquidCoin: "xyz:SMSN",
  },
  {
    id: "000660",
    name: "SK하이닉스",
    code: "000660",
    binanceSymbol: "SKHYNIXUSDT",
    hyperliquidCoin: "xyz:SKHX",
  },
];

export const proxyRanges: ProxyRange[] = ["1D", "1W", "1M", "3M", "1Y"];

export function proxyNameById(id: string): ProxyNameConfig | undefined {
  return proxyNames.find((item) => item.id === id);
}
