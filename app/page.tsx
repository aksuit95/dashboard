import { PageHeader } from "@/components/PageHeader";
import { QuoteCard } from "@/components/QuoteCard";
import { getDb } from "@/lib/db/client";
import { loadBoard } from "@/lib/view/read";

export default function HomePage() {
  const board = loadBoard(getDb());
  return (
    <div>
      <PageHeader
        title="한국 주식 · 글로벌 프록시"
        description="정규장이 끝난 뒤에도 ADR, GDR, 선물, 미국 ETF, Hyperliquid 무기한선물로 한국 주식의 방향을 봅니다. 원화 환산과 프리미엄은 설정에 있는 배수와 같은 환율을 사용합니다."
      />
      <section className="mb-8">
        <h2 className="mb-3 text-sm text-zinc-400">KRX 기준가</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {board.references.map((card) => (
            <QuoteCard key={card.id} card={card} />
          ))}
        </div>
      </section>
      {board.sections.map((section) => (
        <section key={section.id} className="mb-8">
          <h2 className="text-lg font-medium">{section.title}</h2>
          <p className="mb-3 text-sm text-zinc-500">{section.description}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.cards.map((card) => (
              <QuoteCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
