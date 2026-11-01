export type SingleStockSide = "long" | "inverse";

export type SingleStockProduct = {
  code: string;
  brand: string;
  product: string;
  side: SingleStockSide;
};

export type SingleStockName = {
  code: string;
  name: string;
  products: SingleStockProduct[];
};

/** 화면에 두는 단일종목 레버리지·인버스. 코드는 2026-05-27 상장분. */
export const singleStockNames: SingleStockName[] = [
  {
    code: "005930",
    name: "삼성전자",
    products: [
      { code: "0193W0", brand: "KODEX", product: "단일종목 레버리지", side: "long" },
      { code: "0195R0", brand: "TIGER", product: "단일종목 레버리지", side: "long" },
      { code: "0193L0", brand: "PLUS", product: "단일종목 인버스 2X", side: "inverse" },
    ],
  },
  {
    code: "000660",
    name: "SK하이닉스",
    products: [
      { code: "0193T0", brand: "KODEX", product: "단일종목 레버리지", side: "long" },
      { code: "0195S0", brand: "TIGER", product: "단일종목 레버리지", side: "long" },
      { code: "0197X0", brand: "SOL", product: "단일종목 인버스 2X", side: "inverse" },
    ],
  },
];
