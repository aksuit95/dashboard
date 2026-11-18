# mk리서치 대시보드

한국시장 장중 흐름, 장 마감 브리핑, 수급, 기업 분석과 글로벌 프록시를 보는 개인 리서치 대시보드입니다. [운영 사이트](https://dashboard-aksuit95.vercel.app)

## 한국시장 공통 기준: KRX 15:30 종가

- 국내 종목·지수·섹터의 일별 가격과 등락률, 이동평균, 상대강도는 **KRX 정규장 15:30 종가(KST)**를 기준으로 계산합니다. 현재 값과 비교 값에 같은 기준을 적용합니다.
- 장중·주말·휴장일의 일별 비교에는 직전 완료 거래일의 종가를 사용합니다. 거래소, 기준일과 가격 시각, 실제 수집 시각을 구분해 표시합니다.
- KRX 15:30 종가가 없으면 결측으로 표시합니다. NXT·시간외 가격, 거래소가 구분되지 않는 통합 종가와 통합 종가 캐시는 대체에 사용하지 않습니다.
- 실시간 시세와 해외·야간 프록시는 해당 거래소와 세션을 표시합니다. 공시·예탁금·신용 및 수급은 원본 발표일과 시각을 유지합니다. 세부 개발 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다.

## 주요 화면

| 화면 | 경로 | 내용 |
| --- | --- | --- |
| 장중 시장 | `/market-live` | KRX 지수 분봉, 등락 종목 수, 주도주, 섹터 순환매와 리플레이 |
| 장 마감 브리핑 | `/briefing` | 일간·주간 리서치와 PDF 보관 |
| 매크로·실적 캘린더 | `/events` | 국내·미국 주요 지표 일정과 국내 공시·실적 일정 |
| 섹터·종목 등락률 | `/valuation/sectors`, `/rising`, `/stock-returns` | 기간별 수익률과 연속 상승 종목·섹터 |
| 시장 심리 | `/adr`, `/risk` | 등락비율, 시장 지표 장기 비교, 공포·탐욕과 이격도 |
| 수급·ETF | `/investor-flow/kospi200`, `/short-selling`, `/etf-holdings` | 외국인·기관·개인 수급, 국민연금 공시, 공매도, ETF 보유종목 |
| 기업 분석 | `/valuation`, `/valuation/stocks`, `/financials`, `/investment-risk`, `/minervini` | 밸류에이션, 재무건전성, 투자위험, 기술적 분석 |
| 글로벌·야간 시장 | `/`, `/futures`, `/single-stock`, `/market-hours` | ADR·GDR·야간선물·ETF 프록시와 장 운영시간 |

## 장중 시장과 자동 기록

- 네이버페이 증권의 KRX 전용 시세를 장중 15초 간격으로 조회합니다. 주도주는 코스피200·코스닥150의 상승 종목을 누적 거래대금으로 정렬합니다. 섹터 등락률은 비교 가능한 구성종목의 동일가중 평균입니다.
- **지수 리플레이**는 코스피·코스닥 정규장 분봉을 표시합니다. **섹터 리플레이**는 실제로 수집한 1분 단위 기록에서 섹터 등락률 순위와 선두 교대 시점을 표시합니다. 수집이 빠진 분은 빈 구간으로 남깁니다.
- **순환매 레이더**는 10분·30분·1시간 전과 동일한 종목의 등락률 변화폭을 %p로 표시합니다. 양쪽 시점에서 표본이 각각 절반 이상이면서 최소 2종목인 섹터만 비교합니다. 목표 시각에서 최대 90초 이전의 표본까지 사용하며 양쪽 수집 시각을 표시합니다.
- Windows 작업 `Dashboard Market Live Sector Archive`는 평일 08:58 KST에 시작해 확인된 KRX 개장까지 대기합니다. 브라우저와 별도로 수집하며 PC가 켜져 있고 Windows 사용자 세션에 로그인돼 있어야 합니다. 등록 스크립트는 `jobs/market-live-archive-install.ps1`입니다.
- PC의 `data/market-live-archive.sqlite`는 장중 원본과 집계를 저장합니다. 장 마감 후 같은 작업이 섹터 요약과 마지막 10분·30분·1시간 비교를 GitHub에 게시합니다. Vercel에서는 게시된 거래일의 기록을 조회합니다. 장중 기록과 레이더의 실시간 비교는 이 PC에서 구동하는 대시보드에서 확인할 수 있습니다. 운영 로그는 `tmp/market-live-archive.log`입니다.
- 2026년 11월 19일 수능일에는 10:00~16:30 KST 정규장에 수집합니다. 직전 거래일의 KRX 15:30 종가가 제공되지 않는 날에는 섹터 비교가 결측으로 표시됩니다.

## 운영 및 배포

- 운영은 GitHub `cursor/personal-dashboard-readme` 브랜치와 Vercel Git 배포를 연결합니다. 배포 파일은 `data/`와 `public/data/`에 저장합니다. GitHub Actions와 Windows 작업은 실행 결과가 바뀌었을 때 게시합니다.
- **장 마감 브리핑**은 섹터·코스피 및 코스닥 종가·수급 저장본으로 생성합니다. Windows 작업 `Dashboard Market Briefing`이 16:00 이후 자료를 확인해 PDF와 요약을 게시합니다. 브라우저에서 수동으로 저장한 브리핑은 해당 브라우저에 남습니다.
- **투자자별 수급**은 Windows 작업 `Dashboard Investor Flow`가 16:00 이후 갱신합니다. 시장 수급에 사용한 토스 데이터는 원본 집계 범위를 표시하며, 종목 가격 비교는 KRX 15:30 기준을 유지합니다. 토스 Open API는 등록된 IP에서 호출합니다.
- **재무건전성**은 DART 공시와 검증된 시가총액을 결합합니다. 수집 실패 항목과 적용한 회계 기간을 표시합니다. [재무건전성 운영 문서](docs/financial-health.md)

### 로컬 실행

Node.js 24를 사용합니다. `.env.example`을 참고해 필요한 키를 서버 환경에 설정합니다. 로컬 엑셀 경로와 비밀값은 Git에 올리지 않습니다.

```powershell
npm ci
npm run dev
```

```powershell
npm test
npm run build
```

- KRX 시세와 기준가에는 `KRX_API_KEY`를 사용합니다. 승인된 KRX 게시본을 읽는 기능은 해당 거래일과 출처를 검증합니다.
- `KRX_ID`, `KRX_PW`는 로컬 KRX 웹 수집용입니다. `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`은 토스 수급 수집에, `DART_API_KEY`는 공시·실적 수집에 사용합니다.
- `VALUATION_WORKBOOK_PATH`는 로컬 엑셀 내보내기용입니다. `CRON_SECRET`은 Vercel 예약 수집 요청을 검사합니다. 지원하는 환경 변수는 [.env.example](.env.example)을 참고하세요.

### 운영 문서

- [KRX 섹터 자동 배포](docs/sector-auto-deploy.md)
- [일별 시장 지표와 프록시 갱신](docs/vercel-daily-refresh.md)
- [공매도 수집과 검증](docs/short-selling.md)
- [매크로·실적 캘린더](docs/market-events.md)
- [개별종목 연간 실적·컨센서스](docs/annual-estimates.md)

시세와 분석 결과는 개인 리서치용입니다.
