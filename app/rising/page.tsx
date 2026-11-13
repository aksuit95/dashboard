import { PageHeader } from "@/components/PageHeader";
import { RisingBoard } from "@/components/RisingBoard";
export default function RisingPage() {
  return <div><PageHeader title="연속 상승 섹터/종목" description="연속 상승과 상승 확산도를 함께 살펴보고 시장의 주도 후보를 찾습니다." /><RisingBoard /></div>;
}
