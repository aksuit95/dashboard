import { minerviniUniverses, type MinerviniUniverse } from "@/config/minervini";

export function MinerviniGuide({ universe = "kospi200" }: { universe?: MinerviniUniverse }) {
  const spec = minerviniUniverses[universe];
  const name = spec.name;
  return <details className="mt-5 rounded-xl border border-white/10 bg-[#151a22] p-4 text-sm leading-7 text-zinc-400">
    <summary className="cursor-pointer font-medium text-zinc-200">계산 기준과 데이터 범위</summary>
    <div className="mt-5 space-y-7">
      <section aria-labelledby={`${universe}-guide-start`}>
        <h2 id={`${universe}-guide-start`} className="mb-2 font-semibold text-zinc-100">이 페이지는 어떻게 보나요?</h2>
        <p>{name}에서 상승 추세와 상대강도가 있는 종목을 추린 다음, 가격 변동폭과 거래량이 줄어드는 셋업이 있는지 확인하는 일봉 스크리너입니다. 기본 화면인 ‘RS 통과’에는 추세와 RS 조건을 통과한 종목이 나오며, 아직 VCP가 만들어지지 않은 ‘패턴 관찰’ 종목도 포함됩니다. 목록에 있다는 사실만으로 진입 조건이 완성된 것은 아닙니다.</p>
        <p className="mt-2">코스피200과 코스닥150의 RS는 각 지수 안에서 따로 계산합니다. 같은 RS 90이어도 수익률이 같다는 뜻은 아닙니다. 두 분석 영역의 검색·필터·새로고침도 각각 적용됩니다.</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li><strong className="text-zinc-200">분석 기준일을 먼저 확인합니다.</strong> 표의 종가는 이 날짜의 정규장 종가입니다. ‘수집’은 데이터를 가져온 시각이므로, 수집 시각이 오늘이어도 분석 기준일은 전 거래일일 수 있습니다.</li>
          <li><strong className="text-zinc-200">‘RS 통과’에서 후보를 살펴봅니다.</strong> RS 하한을 80 또는 90으로 올리면 상대적으로 더 강한 종목만 남습니다. ‘추세 통과’에서는 RS가 70 미만인 종목도 볼 수 있습니다.</li>
          <li><strong className="text-zinc-200">‘VCP 셋업’에서 패턴이 갖춰진 종목을 확인합니다.</strong> 이 목록에는 ‘돌파 대기’와 ‘거래량 돌파’가 함께 나옵니다. ‘거래량 돌파’ 탭은 그중 종가와 거래량 조건까지 충족한 종목만 보여 줍니다.</li>
          <li><strong className="text-zinc-200">종목명을 눌러 조건 상세를 펼칩니다.</strong> 8가지 추세 조건의 통과 여부, 수축 폭, 거래량 감소, 이동평균선, 손절 거리를 확인하고 ‘종목 차트 확인’에서 실제 베이스 모양을 함께 살펴봅니다.</li>
          <li><strong className="text-zinc-200">피벗 대비 위치와 손절 거리를 함께 읽습니다.</strong> 같은 셋업이라도 종가가 피벗보다 많이 높으면 종가 기준 위험이 커집니다. 실적 성장·공시 등은 이 스크리너에 반영되어 있지 않습니다.</li>
        </ol>
        <p className="mt-3 text-xs">상단 단계 카드와 탭 옆 숫자는 기본 기준(RS 70)의 전체 집계입니다. 검색어·RS 하한을 적용한 실제 표시 수는 검색창 오른쪽의 ‘○개’입니다. ‘전체 종목’과 ‘추세 통과’에서는 RS 하한 선택이 적용되지 않습니다. ‘피벗 가까운 순’은 피벗 대비 등락률의 절댓값이 작은 순서이고, ‘거래량 배수 순’은 당일 거래량/50일 평균이 큰 순서입니다.</p>
      </section>

      <section aria-labelledby={`${universe}-guide-status`}>
        <h2 id={`${universe}-guide-status`} className="mb-2 font-semibold text-zinc-100">상태별 의미 — ‘패턴 관찰’과 ‘돌파 대기’는 어떻게 다른가요?</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[600px] text-left text-xs leading-6">
            <thead className="bg-white/5 text-zinc-200"><tr><th scope="col" className="px-3 py-2">상태</th><th scope="col" className="px-3 py-2">화면에서 뜻하는 것</th><th scope="col" className="px-3 py-2">상세에서 확인할 내용</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-sky-300">패턴 관찰</th><td className="px-3 py-3">추세 가격 조건 7개와 RS 70 이상은 통과했지만, VCP 근사 조건이 부족하거나 종가가 피벗보다 5% 넘게 낮은 상태입니다. VCP가 확인되었다는 뜻은 아닙니다.</td><td className="px-3 py-3">3구간 폭이 연속으로 줄어드는지, 마지막 폭이 10% 이내인지, 변동폭·거래량 감소 배수가 1보다 작은지, 피벗과 얼마나 떨어져 있는지 확인합니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-amber-300">돌파 대기</th><td className="px-3 py-3">추세·RS·VCP 근사를 통과하고 종가가 피벗의 -5%~+5% 안에 있습니다. 아직 거래량 돌파 조건을 모두 충족하지 않은 셋업입니다.</td><td className="px-3 py-3">종가가 피벗을 넘었는지와 당일 거래량이 1.5배 이상인지 따로 봅니다. 가격만 피벗을 넘고 거래량이 부족한 종목도 이 상태로 남을 수 있습니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-emerald-300">거래량 돌파</th><td className="px-3 py-3">추세·RS·VCP 근사 통과 후, 기준일 종가가 피벗을 넘고 당일 거래량이 전일까지 50일 평균의 1.5배 이상입니다. 피벗 대비 상승 폭도 5% 이내여야 합니다.</td><td className="px-3 py-3">일봉 기준으로 조건이 충족된 결과입니다. 장중 잠깐 넘은 것과는 다르며, 이후 돌파 유지 여부나 다음 거래일 가격은 아직 반영하지 않습니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-rose-300">추격 주의</th><td className="px-3 py-3">추세·RS를 통과했지만 종가가 피벗보다 5% 초과 상승했습니다. VCP 충족 여부와 관계없이 이 상태를 우선 표시합니다.</td><td className="px-3 py-3">피벗 기준 손절 거리보다 종가 기준 손절 거리가 얼마나 커졌는지 확인합니다. 이 표시는 곧 하락한다는 예측이 아닙니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-zinc-300">추세 미충족</th><td className="px-3 py-3">유니버스 제외 조건에는 해당하지 않지만, 추세 가격 조건 7개 중 하나 이상을 충족하지 못했습니다. RS가 높아도 이 상태가 먼저 표시됩니다.</td><td className="px-3 py-3">상세의 × 표시로 미충족 조건을 확인할 수 있습니다. ‘전체 종목’에서 조회합니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-zinc-300">RS 미충족</th><td className="px-3 py-3">추세 가격 조건 7개는 모두 통과했지만 RS가 70 미만입니다.</td><td className="px-3 py-3">‘추세 통과’ 또는 ‘전체 종목’에서 확인합니다. 주가 추세와 시장 내 상대적 강도를 구분해서 읽습니다.</td></tr>
              <tr><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-zinc-300">대상 제외</th><td className="px-3 py-3">일봉 이력, 거래 가능 상태, 시총, 거래대금 등 기본 분석 대상 조건을 충족하지 못했습니다.</td><td className="px-3 py-3">‘전체 종목’에서 이름을 누르면 제외 이유가 나옵니다. 이력 부족으로 계산하지 못한 값은 ‘—’이며, 0점이나 조건 통과를 뜻하지 않습니다.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">예를 들어 추세·RS를 통과하고 피벗이 50,000원인 종목을 가정합니다. VCP가 미충족이면 피벗 근처여도 ‘패턴 관찰’입니다. VCP 충족 후 종가가 49,000원(-2%)이면 ‘돌파 대기’, 종가가 50,500원(+1%)이고 거래량이 1.6배이면 ‘거래량 돌파’입니다. 같은 종가에서 거래량이 1.2배라면 ‘돌파 대기’이며, 종가가 53,000원(+6%)이면 ‘추격 주의’입니다.</p>
        <p className="mt-2 text-xs">이 상태들은 고정된 진행 순서나 누적 이력이 아닙니다. 매 거래일 다시 계산하며, 피벗도 20일 구간에 따라 바뀝니다. 어제 돌파한 종목이 오늘도 반드시 ‘거래량 돌파’로 남는 것은 아닙니다. VCP·돌파가 0개면 그 기준일에 조건을 모두 충족한 종목이 없다는 뜻입니다.</p>
      </section>

      <section aria-labelledby={`${universe}-guide-columns`}>
        <h2 id={`${universe}-guide-columns`} className="mb-2 font-semibold text-zinc-100">표의 각 지표 읽는 법</h2>
        <dl className="space-y-3">
          <div><dt className="font-medium text-zinc-200">종가</dt><dd>분석 기준일의 정규장 마지막 가격입니다. 실시간 현재가나 시간외 가격이 아니므로, 다른 시세 화면과 비교할 때 같은 날짜·시장인지 확인해야 합니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">RS — {name} 내 상대강도 순위</dt><dd>최근 여러 기간의 수익률을 합친 점수의 백분위입니다. RS 90은 분석 가능한 {name} 구성종목 안에서 대략 상위 10% 수준의 가격 성과라는 뜻입니다. 수익률 +90%나 상승 확률 90%를 의미하지 않습니다. 전체 시장이 하락해도 덜 하락한 종목의 RS가 높을 수 있습니다. 70은 기본 통과선이며 80·90은 화면에서 더 좁혀 보는 기준입니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">추세 — 8개 조건 중 통과 개수</dt><dd>8/8에는 가격 조건 7개와 RS ≥ 70이 포함됩니다. ‘추세 통과’ 카드는 가격 조건 7개만을 뜻하므로 이 탭에는 7/8 종목도 나올 수 있습니다. 8/8이어도 VCP와 거래량 돌파까지 통과한 것은 아닙니다. 단순 개수만 비교하기보다 상세에서 어떤 조건이 ×인지 확인합니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">피벗 / 피벗 대비</dt><dd>피벗은 분석 기준일을 제외한 직전 20거래일의 최고가입니다. ‘피벗 대비’는 (종가/피벗−1)×100입니다. -3%면 피벗 아래 3%, +2%면 피벗 위 2%이며, 0%는 피벗과 같은 가격으로 아직 종가 돌파가 아닙니다. +5%까지는 셋업 범위에 포함하고 +5% 초과는 ‘추격 주의’로 분류합니다. 이 피벗은 마지막 수축 구간의 저항선을 사람이 판단한 값과 다를 수 있습니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">거래량/50일</dt><dd>기준일 거래량을 전일까지 50일 평균 거래량으로 나눈 값입니다. 1.00배는 평균 수준, 1.50배는 평균보다 50% 많음, 0.60배는 평균의 60%입니다. 1.5배 이상이어도 추세·RS·VCP와 종가 돌파를 함께 충족해야 ‘거래량 돌파’입니다. 거래량이 많다는 값만으로 매수·매도 어느 쪽이 우세한지 구분하지는 않습니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">손절 참고가 / 피벗→손절</dt><dd>손절 참고가는 피벗의 92%와 마지막 10일 저점의 99.5% 중 높은 값입니다. ‘피벗→손절’은 피벗에서 이 가격까지의 하락 거리입니다. 피벗 50,000원, 손절 참고가 46,000원이면 8%입니다. 실제 종가에서의 손절 거리는 종목 상세에 따로 표시하며, 피벗보다 높은 가격에서는 이 거리가 더 커질 수 있습니다.</dd></div>
        </dl>
      </section>

      <section aria-labelledby={`${universe}-guide-detail`}>
        <h2 id={`${universe}-guide-detail`} className="mb-2 font-semibold text-zinc-100">종목 상세: 추세와 VCP 지표 해석</h2>
        <dl className="space-y-3">
          <div><dt className="font-medium text-zinc-200">20 / 50 / 150 / 200일선</dt><dd>각 기간 종가의 단순평균입니다. 핵심 추세 조건은 종가가 50일선 위에 있고, 50일선 &gt; 150일선 &gt; 200일선인 상태입니다. 20일선 위 여부는 단기 가격 위치를 보는 보조 정보로, 기본 통과 조건에는 들어가지 않습니다. 200일선은 최근 21거래일 매일 전일보다 높아야 하며, 105거래일 연속 상승은 추가 정보입니다. 105일 미충족이어도 21일 조건을 충족하면 통과할 수 있습니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">52주 저점 대비 / 고점 대비</dt><dd>최근 252거래일의 장중 최저가·최고가와 기준일 종가를 비교합니다. 저점 대비 +40%는 저점보다 40% 높다는 뜻으로 +30% 이상이면 통과합니다. 고점 대비 -10%는 고점보다 10% 낮다는 뜻이며 -25% 이상이면 통과합니다. 두 조건은 저점에서 어느 정도 회복했고 고점에서도 너무 멀지 않은 가격 위치를 함께 확인합니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">3구간 고저폭 — 오래된 구간 → 최근 구간</dt><dd>기준일을 제외한 최근 30거래일을 10일씩 나누고 각 구간의 (최고가/최저가−1)×100을 계산합니다. 예를 들어 25% → 12% → 6%면 구간 폭이 연속으로 줄어든 모습입니다. 세 값이 순서대로 작아지고 마지막 값이 10% 이하여야 이 조건을 통과합니다. 이는 고점에서 저점까지의 실제 조정률이나 사람이 찾은 스윙별 수축 횟수와 다른, 고정 구간의 근사치입니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">일중 변동폭 최근10일/직전10일</dt><dd>하루의 (고가−저가)/종가를 평균 낸 뒤 최근 10일과 그 직전 10일을 비교합니다. 0.70배는 일중 변동폭이 직전 구간보다 약 30% 작아졌다는 뜻입니다. 1배 미만이어야 통과하며, 1배 이상이면 변동성이 충분히 줄었다고 판정하지 않습니다. 구간 전체의 고저폭과는 별개의 조건입니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">거래량 최근10일/50일 — 거래량 마름(dry-up)</dt><dd>전일까지 최근 10일 평균 거래량/50일 평균 거래량입니다. 0.60배면 최근 거래량이 50일 평균보다 40% 적다는 뜻입니다. 1배 미만이어야 통과합니다. 표의 ‘거래량/50일’이 당일 돌파의 거래량을 보는 값이라면, 이 값은 돌파 전 셋업에서 거래량이 줄었는지를 보는 값입니다. 거래량 감소만으로 매도 물량 소진을 확정할 수는 없습니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">VCP 근사 충족</dt><dd>3구간 폭의 연속 축소, 마지막 폭 10% 이내, 일중 변동폭 배수 1 미만, 거래량 감소 배수 1 미만을 모두 충족해야 합니다. 하나라도 부족하면 미충족입니다. 피벗과의 거리·돌파 여부는 이 판정과 별도로 상태에 반영됩니다. 돌파봉 자체가 계산에 섞여 피벗이나 거래량 평균을 끌어올리지 않도록 기준일 봉은 이 네 가지 셋업 계산에서 제외합니다.</dd></div>
          <div><dt className="font-medium text-zinc-200">20일 평균 거래대금 근사 / 시총</dt><dd>최근 20거래일의 종가×거래량을 평균 내 유동성을 확인합니다. 실제 체결대금 합계와는 차이가 있습니다. 평균 10억원 이상, 수집 시점 시가총액 1,000억원 이상을 후보의 기본 조건으로 사용합니다.</dd></div>
        </dl>
      </section>

      <section aria-labelledby={`${universe}-guide-risk`}>
        <h2 id={`${universe}-guide-risk`} className="mb-2 font-semibold text-zinc-100">손절 거리와 2R 참고가를 함께 읽기</h2>
        <p>손절 참고가 = max(피벗×0.92, 마지막 10일 저점×0.995)입니다. 마지막 10일은 기준일을 제외한 구간입니다. 피벗→손절 거리 = (1−손절 참고가/피벗)×100, 종가→손절 거리 = (1−손절 참고가/종가)×100으로 계산합니다.</p>
        <p className="mt-2">예를 들어 피벗 50,000원, 손절 참고가 46,000원이라면 피벗 기준 거리는 8%입니다. 하지만 종가가 52,000원이면 종가 기준 거리는 약 11.5%입니다. 상세에서는 종가 기준 거리가 8%를 넘으면 붉은 글씨로 표시합니다. 표에 8%가 보인다고 현재 종가에서도 위험이 8% 이내라는 뜻은 아닙니다.</p>
        <p className="mt-2">1R은 종가와 손절 참고가의 가격 차이이고, 2R 참고가 = 종가 + 2×(종가−손절 참고가)입니다. 위 예에서는 64,000원입니다. 이는 가정한 위험의 2배에 해당하는 계산 가격으로, 실적·저항대 등을 반영한 목표주가나 도달 확률이 아닙니다. 종가가 손절 참고가 이하이면 유효한 종가 기준 위험·2R 값을 표시하지 않습니다. 호가단위, 수수료, 슬리피지와 갭 하락은 반영하지 않아 실제 체결 손실은 계산 거리와 다를 수 있습니다.</p>
      </section>

      <section aria-labelledby={`${universe}-guide-data`}>
        <h2 id={`${universe}-guide-data`} className="mb-2 font-semibold text-zinc-100">계산 범위·갱신 시각·데이터 한계</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-zinc-200">대상:</strong> 수집 시점의 네이버 {name} 전체 구성종목입니다. 기업 분할 등으로 일시적으로 {spec.size}개를 초과할 수 있습니다. 현재 구성·시총·거래 가능 상태를 사용하며 과거 편입 이력의 백테스트가 아닙니다.</li>
          <li><strong className="text-zinc-200">대상 제외:</strong> 우선주, 거래 제한·상태 미확인, 당일 거래량 0, 시총 1,000억원 미만, 20일 평균 종가×거래량 10억원 미만, 253거래일 미만은 후보에서 제외합니다. 관리종목·정리매매 지정 여부는 별도 KRX 원장과 대조하지 않았습니다.</li>
          <li><strong className="text-zinc-200">RS 계산:</strong> 0.4×63일 수익률 + 0.2×126일 + 0.2×189일 + 0.2×252일 수익률을 점수로 만들고, 253개 종가가 확보된 {name} 구성종목 전체에서 0~100 백분위로 환산합니다. 유동성·추세 필터를 적용하기 전에 순위를 매기고 동점은 평균 순위를 부여합니다. 표시값은 반올림하지만 통과 여부는 반올림 전 값으로 판단합니다.</li>
          <li><strong className="text-zinc-200">RS 산정 ○/○종목:</strong> 앞 숫자는 RS를 계산할 일봉 이력이 있는 종목 수, 뒤 숫자는 수집한 구성종목 수입니다. RS 통과 종목 수가 아닙니다. 신규 상장·분할 종목은 이력 부족으로 앞 숫자에 포함되지 않을 수 있습니다. 한국 전 종목이나 IBD 공식 RS와는 다르며 섹터·벤치마크 초과수익은 포함하지 않습니다.</li>
          <li><strong className="text-zinc-200">일별 갱신:</strong> 한국시간 16:00을 경계로 완료된 정규장 일봉을 갱신합니다. 그 전에는 전 거래일, 주말·등록된 휴장일에는 마지막 거래일 결과를 사용합니다. 실제 수집 완료 시각은 예약 실행 시각과 공급자의 종가 반영 상태에 따라 늦어질 수 있습니다. ‘결과 새로고침’은 같은 거래일의 저장된 성공 결과를 읽습니다.</li>
          <li><strong className="text-zinc-200">지연·빈 값:</strong> 수집 실패·일부 종가 미반영 시 마지막 성공 결과와 기준일을 유지하고 재시도합니다. ‘이전 결과 표시 중’이면 기준일을 다시 확인합니다. ‘—’는 이력 부족·계산 불가 등의 결측값이며 0이 아닙니다.</li>
          <li><strong className="text-zinc-200">포함하지 않은 분석:</strong> 실제 스윙 기반 2~6회 VCP의 정밀 판정, EPS·매출 성장 및 가속도(SEPA), 실적 발표·공시·뉴스 분석은 포함하지 않습니다. 이 페이지의 ‘거래량 돌파’는 정해진 기술적 조건의 충족 여부입니다.</li>
        </ul>
        <p className="mt-3 text-xs">데이터 출처: <a className="underline" href={`https://stock.naver.com/domestic/index/${spec.indexCode}/enrollstocks`} target="_blank" rel="noreferrer">네이버 {name}</a> · <a className="underline" href="https://github.com/FinanceData/FinanceDataReader/blob/master/src/FinanceDataReader/naver/data.py" target="_blank" rel="noreferrer">FinanceDataReader와 같은 네이버 일봉 피드</a>.</p>
      </section>
    </div>
  </details>;
}
