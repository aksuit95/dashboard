/** TWSE 상장 월매출만 담는다. 6488(글로벌웨이퍼)은 이 공개 목록에 없어 빼 두었다. */
export type TaiwanCompany = {
  symbol: string;
  name: string;
  sector: string;
};

export const taiwanCompanies: TaiwanCompany[] = [
  { symbol: "2330", name: "TSMC", sector: "파운드리" },
  { symbol: "2303", name: "UMC", sector: "파운드리" },
  { symbol: "2317", name: "폭스콘", sector: "ODM·AI 서버" },
  { symbol: "2382", name: "콴타", sector: "ODM·AI 서버" },
  { symbol: "3231", name: "위스트론", sector: "ODM·AI 서버" },
  { symbol: "6669", name: "위윈", sector: "ODM·AI 서버" },
  { symbol: "2357", name: "에이수스", sector: "ODM·AI 서버" },
  { symbol: "2324", name: "컴팔", sector: "ODM·AI 서버" },
  { symbol: "3711", name: "ASE", sector: "OSAT" },
  { symbol: "2449", name: "경원전자", sector: "OSAT" },
  { symbol: "6239", name: "파워텍", sector: "OSAT" },
  { symbol: "3037", name: "유니마이크론", sector: "PCB" },
  { symbol: "8046", name: "난야PCB", sector: "PCB" },
  { symbol: "4958", name: "젠딩", sector: "PCB" },
  { symbol: "2383", name: "EMC", sector: "CCL" },
  { symbol: "2408", name: "난야", sector: "소재" },
  { symbol: "2344", name: "윈본드", sector: "소재" },
  { symbol: "2327", name: "야게오", sector: "소재" },
  { symbol: "3008", name: "라간", sector: "광학·CPO" },
  { symbol: "2454", name: "미디어텍", sector: "설계" },
  { symbol: "3443", name: "GUC", sector: "설계" },
  { symbol: "3034", name: "노바텍", sector: "설계" },
  { symbol: "2379", name: "리얼텍", sector: "설계" },
  { symbol: "2308", name: "델타", sector: "전력" },
];
