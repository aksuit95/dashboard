import Link from "next/link";

const sections = [
  { title: "시장 한눈에", intro: "지금 시장의 분위기와 앞으로 확인할 일정을 살펴봅니다.", pages: [
    ["/events", "매크로 · 실적 캘린더", "금리·경제지표 발표와 기업 실적 일정을 확인합니다. 발표 전에는 예상 일정이고, 실제 발표 시각이나 결과는 달라질 수 있습니다."],
    ["/valuation/sectors", "섹터/종목 등락률", "어떤 업종과 종목이 올랐거나 내렸는지 비교합니다. 시장과 기간을 고르고 섹터를 선택해 구성 종목을 살펴보세요. 섹터 수치는 구성 종목의 단순평균으로 공식 업종 지수와 다릅니다."],
    ["/adr", "코스피 · 코스닥 ADR", "시장 지수와 등락비율 등의 장기 흐름을 비교합니다. 여기의 ADR은 일정 기간 상승 종목 수와 하락 종목 수의 비율이며, 해외 주식예탁증서 ADR과는 다른 뜻입니다."],
    ["/risk", "공포 · 탐욕 지수", "시장 심리와 변동성 등 여러 보조 지표를 함께 봅니다. 극단적인 수치가 곧바로 매수·매도 시점을 뜻하지는 않습니다."],
  ] },
  { title: "수급 · ETF", intro: "누가 거래하고 있는지, 펀드가 무엇을 담고 있는지 살펴봅니다.", pages: [
    ["/investor-flow/kospi200", "투자자별 수급", "개인·외국인·기관의 매수와 매도 흐름을 비교합니다. 순매수는 매수 금액에서 매도 금액을 뺀 값입니다. 기간과 단위를 확인하고 가격 움직임과 함께 보세요."],
    ["/short-selling", "코스피200 공매도", "공매도 관련 지표와 종목별 현황을 살펴봅니다. 공매도는 빌린 주식을 먼저 파는 거래로, 잔고와 거래량은 서로 다른 지표입니다. 샘플을 선택했다면 실제 시장 데이터가 아닌 예시입니다."],
    ["/etf-holdings", "ETF 보유 종목", "ETF가 어떤 종목을 어느 비중으로 담는지, 기간에 따라 구성이 어떻게 바뀌었는지 비교합니다. 구성 수량 변화만으로 실제 매매량이나 투자자의 의도를 단정할 수 없습니다."],
  ] },
  { title: "기업 · 종목 분석", intro: "관심 기업의 가격, 실적과 재무 상태를 차례로 확인합니다.", pages: [
    ["/valuation", "코스피200 밸류에이션", "지수의 평가 수준과 실적 관련 지표를 기간별 차트로 봅니다. 지표와 기간을 바꾸고 과거 평균 및 현재 위치를 비교하세요. 원본 자료의 갱신일도 확인합니다."],
    ["/valuation/stocks", "개별종목 밸류에이션", "종목명이나 코드로 검색하고 PER·PBR 등으로 비교합니다. 종목을 선택하면 주가와 지표 이력을 살펴볼 수 있습니다. 숫자가 낮다는 이유만으로 저평가라고 결론 내리지 마세요."],
    ["/financials", "현금 · 재무건전성", "기업의 현금, 부채와 현금흐름을 살펴봅니다. 숫자의 단위와 회계 기간을 확인하고, 일회성 변화와 업종별 특성을 함께 고려하세요."],
    ["/investment-risk", "투자위험", "투자 판단 전에 확인할 위험 관련 정보를 살펴봅니다. 표시된 항목과 기준일을 확인하고 중요한 내용은 원문 공시에서 다시 확인하세요."],
    ["/minervini", "미너비니 기술적 분석", "주가 추세와 이동평균 등 조건을 이용해 종목을 살펴봅니다. 조건 충족은 과거 가격을 바탕으로 한 분류이지 미래 수익을 보장하는 매매 신호가 아닙니다."],
  ] },
  { title: "글로벌 · 야간 시장", intro: "한국 장이 끝난 뒤 움직이는 해외 시장과 참고 가격을 봅니다.", pages: [
    ["/", "글로벌 프록시", "해외에서 거래되는 관련 상품, 선물과 환율 등을 통해 국내 시장과 관련된 움직임을 참고합니다. 프록시는 대용 지표로 국내 주가와 정확히 같지 않습니다. 시장·거래 상태·시세 시각을 함께 확인하세요."],
    ["/futures", "글로벌 시장", "해외 지수와 선물 등 글로벌 시장의 움직임을 살펴봅니다. 나라별 거래시간과 지연 여부가 다르므로 같은 순간의 가격인지 확인하세요."],
    ["/single-stock", "단일종목 ETF", "한 종목을 추종하는 해외 ETF를 살펴봅니다. 레버리지·인버스 상품은 일간 수익률을 목표로 하므로 여러 날의 수익률이 원주식의 단순 배수가 되지 않을 수 있습니다."],
    ["/market-hours", "시장 운영시간", "한국과 해외 시장의 거래시간을 확인합니다. 현지 휴장일과 서머타임에 따라 실제 일정이 달라질 수 있습니다."],
  ] },
];

const terms = [
  ["종가 / 거래일", "종가는 정해진 거래가 끝날 때의 가격입니다. 거래일은 시장이 실제로 열린 날로, 주말과 휴장일은 빠집니다."],
  ["등락률", "기준 가격에 비해 얼마나 변했는지 나타낸 비율입니다. 예를 들어 10,000원에서 11,000원이 되면 +10%입니다. 기간과 비교 기준일을 먼저 확인하세요."],
  ["시가총액 / 섹터", "시가총액은 주가에 상장 주식 수를 곱한 기업 가치의 시장 평가액입니다. 섹터는 비슷한 사업을 묶은 분류입니다."],
  ["이동평균 / 이격도", "이동평균은 일정 기간 가격의 평균입니다. 이격도는 가격이 이동평균에 비해 어느 위치에 있는지 나타냅니다. 둘 다 과거 가격을 요약합니다."],
  ["PER / PBR", "PER은 주가를 주당순이익과, PBR은 주가를 주당순자산과 비교한 비율입니다. 이익의 기준 기간과 업종에 따라 해석이 달라집니다."],
  ["ETF / 프록시", "ETF는 여러 자산 또는 특정 대상을 따라가도록 만든 상장 펀드입니다. 프록시는 직접 가격을 대신해 흐름을 참고하는 다른 상품이나 지표입니다."],
];

export default function GuidePage() {
  return <div className="space-y-10 pb-10 text-zinc-300">
    <header className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/10 via-[#141d21] to-[#111820] p-6 sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Getting started</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">리서치보드 사용법</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">시장 전체의 흐름부터 관심 기업의 숫자까지, 투자에 필요한 자료를 차근차근 살펴보는 안내서입니다. 처음이라면 아래 순서대로 시작해 보세요.</p>
      <div className="mt-6 flex flex-wrap gap-2 text-[15px]">{[["#start", "처음 시작하기"], ["#reading", "숫자 읽는 법"], ["#menus", "메뉴 안내"], ["#terms", "기초 용어"]].map(([href, label]) => <a key={href} href={href} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-zinc-200 transition hover:border-emerald-400/50 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">{label} <span aria-hidden="true">↓</span></a>)}</div>
    </header>

    <section id="start" className="scroll-mt-6">
      <p className="text-xs font-bold tracking-widest text-emerald-400">01 / START</p><h2 className="mt-2 text-2xl font-bold text-white">처음이라면 이렇게 살펴보세요</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-3">{[
        ["01", "시장 분위기 파악", "섹터/종목 등락률에서 시장과 기간을 선택해 강한 업종과 약한 업종을 살펴보세요.", "/valuation/sectors", "등락률 보기"],
        ["02", "관심 종목 살펴보기", "관심 종목을 찾았다면 밸류에이션과 재무건전성에서 가격에 비해 실적과 재무가 어떤지 확인하세요.", "/valuation/stocks", "종목 분석하기"],
        ["03", "일정과 위험 확인", "실적 발표 등 중요한 일정과 투자위험을 확인하고, 여러 자료를 종합해 스스로 판단하세요.", "/events", "캘린더 보기"],
      ].map(([number, title, description, href, label]) => <div key={number} className="flex flex-col rounded-xl border border-white/[0.08] bg-[#151b23] p-5"><span className="text-[15px] font-bold text-emerald-400">{number}</span><h3 className="mt-3 font-bold text-white">{title}</h3><p className="mt-2 flex-1 text-[15px] leading-7 text-zinc-300">{description}</p><Link href={href} className="mt-4 text-[15px] font-semibold text-emerald-300 hover:text-emerald-200">{label} →</Link></div>)}</div>
    </section>

    <section id="reading" className="scroll-mt-6 rounded-2xl border border-white/[0.08] bg-[#151b23] p-6 sm:p-7">
      <p className="text-xs font-bold tracking-widest text-emerald-400">02 / READ THE DATA</p><h2 className="mt-2 text-2xl font-bold text-white">숫자를 읽기 전에 확인할 것</h2>
      <div className="mt-5 grid gap-x-8 gap-y-5 text-[15px] leading-7 sm:grid-cols-2">
        <div><h3 className="font-bold text-zinc-100">기준일과 가격 기준</h3><p className="mt-1 text-zinc-300">국내 주식·지수의 기본 비교 기준은 한국시간 <strong className="text-zinc-200">KRX 정규장 15:30 종가</strong>입니다. 장중이나 주말·휴장일에는 직전 완료 거래일을 기준으로 해석하세요. 실제 기준일을 확인하고, NXT·시간외 가격과 혼동하지 마세요.</p></div>
        <div><h3 className="font-bold text-zinc-100">수집 시각과 시세 시각</h3><p className="mt-1 text-zinc-300">수집 시각은 데이터를 가져온 때이고 가격 기준 시각은 가격이 성립한 때입니다. 해외·야간 시세는 시장과 세션, 시각이 별도입니다. 공시와 발표 자료는 원래의 발표일을 확인하세요.</p></div>
        <div><h3 className="font-bold text-zinc-100">기간과 단위</h3><p className="mt-1 text-zinc-300">1D는 하루, 1W는 일주일, 1M은 한 달, 1Y는 1년을 뜻합니다. 화면마다 실제 비교 거래일과 계산 방식이 다를 수 있습니다. 원·억원·% 등 단위와 화면의 설명을 함께 보세요.</p></div>
        <div><h3 className="font-bold text-zinc-100">빈 값과 오래된 자료</h3><p className="mt-1 text-zinc-300">‘—’, 수집 대기·실패·지연 표시는 0이나 변동 없음이 아닙니다. 이전 정상 자료가 남아 있을 수도 있으므로 기준일과 상태를 확인하세요. 상세 상태는 <Link href="/health" className="text-emerald-300 underline underline-offset-4">데이터 수집 상태</Link>에서 볼 수 있습니다.</p></div>
      </div>
      <p className="mt-6 rounded-lg border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-[15px] leading-6 text-amber-100/80">데이터 출처와 갱신 주기는 화면마다 다릅니다. 일부 자료는 수동 갱신되거나 지연될 수 있으므로 중요한 판단 전에는 해당 화면의 출처·기준일과 원문을 확인하세요.</p>
    </section>

    <section id="menus" className="scroll-mt-6"><p className="text-xs font-bold tracking-widest text-emerald-400">03 / EXPLORE</p><h2 className="mt-2 text-2xl font-bold text-white">메뉴별로 무엇을 볼 수 있나요?</h2><p className="mt-2 text-[15px] leading-6 text-zinc-300">사이드바에서 원하는 메뉴를 선택하세요. 휴대전화에서는 상단 메뉴 버튼을 눌러 펼칠 수 있습니다.</p>
      <div className="mt-5 space-y-5">{sections.map((section) => <div key={section.title} className="rounded-2xl border border-white/[0.08] bg-[#151b23] p-5 sm:p-6"><h3 className="text-lg font-bold text-white">{section.title}</h3><p className="mt-1 text-[15px] text-zinc-300">{section.intro}</p><div className="mt-4 divide-y divide-white/[0.07]">{section.pages.map(([href, title, description]) => <div key={href} className="grid gap-1 py-4 first:pt-1 last:pb-0 sm:grid-cols-[190px_1fr] sm:gap-4"><Link href={href} className="w-fit text-[15px] font-semibold text-emerald-300 hover:text-emerald-200">{title} <span aria-hidden="true">↗</span></Link><p className="text-[15px] leading-6 text-zinc-300">{description}</p></div>)}</div></div>)}</div>
    </section>

    <section id="terms" className="scroll-mt-6"><p className="text-xs font-bold tracking-widest text-emerald-400">04 / GLOSSARY</p><h2 className="mt-2 text-2xl font-bold text-white">자주 만나는 기초 용어</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2">{terms.map(([term, description]) => <div key={term} className="rounded-xl border border-white/[0.08] bg-[#151b23] p-5"><dt className="font-bold text-zinc-100">{term}</dt><dd className="mt-2 text-[15px] leading-6 text-zinc-300">{description}</dd></div>)}</dl></section>
    <p className="border-t border-white/[0.08] pt-6 text-[15px] leading-6 text-zinc-500">이 보드는 자료를 살펴보기 위한 도구이며 투자 권유나 매매 신호가 아닙니다. 하나의 지표만으로 판단하지 말고 원문과 여러 자료를 함께 확인하세요.</p>
  </div>;
}
