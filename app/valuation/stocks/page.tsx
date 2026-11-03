import { PageHeader } from "@/components/PageHeader";
import { StockValuationBoard } from "@/components/StockValuationBoard";

export default function StockValuationPage() {
  return <div><PageHeader title="개별종목 밸류에이션" description="QuantiWise 12개월 선행 컨센서스 · 종목별 비교와 TradingView 주가 차트" /><StockValuationBoard /></div>;
}
