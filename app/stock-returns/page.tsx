import { PageHeader } from "@/components/PageHeader";
import { StockReturnsBoard } from "@/components/StockReturnsBoard";

export default function StockReturnsPage() {
  return <div><PageHeader title="종목별 등락률" description="코스피와 코스닥 종목의 기간별 등락률을 시가총액과 함께 확인합니다." /><StockReturnsBoard /></div>;
}
