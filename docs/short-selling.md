# 코스피200 공매도 대시보드 — 1단계

`/short-selling`은 저장된 JSON만 읽는 공매도 화면이다. 운영 데이터가 없으면 대기 안내를 표시하고, 사용자가 합성 샘플을 명시적으로 선택할 수 있다. `npm run dev`와 `npm run build`의 사전 단계가 운영 `data/`와 `examples/short-selling/`의 필요한 JSON을 `public/short-selling-data/`에 복사한다. 이 디렉터리는 생성물로 Git에서 제외하며 배포 빌드마다 갱신된다.

## 실제 호출 검증

2026-11-04 오전 KST에 실행했다. 장중이므로 검증 기준일은 **2026-11-03, KRX 15:30 정규장 종가**다. 재현 가능한 원본 결과와 일부 실제 응답은 [short-selling-probe.json](short-selling-probe.json)에 있다. 비밀번호·키·로그인 ID는 보고서에 넣지 않는다.

| 항목 | 최소 호출 | 결과 | 대안/다음 조치 |
| --- | --- | --- | --- |
| 코스피200 구성종목 | pykrx `get_index_portfolio_deposit_file("1028", date=...)` | 성공: 201개 | 계속 실패하면 KRX 지수구성종목 공식 다운로드를 기준일별로 확보하거나 라이선스 데이터 공급자 사용. ETF 편입종목으로 대체하지 않음 |
| 종목별 공매도 거래량·대금·분모 | pykrx 원본 `MDCSTAT30101` | 성공: 코스피 전체 939행 | 대안은 KRX 공매도 통계 다운로드 또는 키움 등 증권사 공매도 추이 API. 거래소 범위·과거 조회 범위·단위가 일치하는지 별도 검증 필요 |
| 순보유잔고 | pykrx 원본 `MDCSTAT30501` | 성공: 10월 29일 940행, 11월 3일 0행 | 공시 지연과 보고 대상 범위를 유지해야 하며 공매도 거래량 누적으로 추정하지 않음 |
| 종가·거래대금·시총 | pykrx OHLCV | 성공 | **KRX 공식 Open API `sto/stk_bydd_trd` 성공, 939행**. 생산 수집기는 이 공식 API를 사용 |
| 코스피200 지수 | pykrx 원본 `MDCSTAT00301` | 성공 | **KRX 공식 Open API `idx/kospi_dd_trd` 성공**. 지수명 `코스피 200`, `BAS_DD`, `CLSPRC_IDX` 확인. 현재 배치의 지수 기간 수집은 pykrx 경로이며 공식 API 기간 수집 fallback은 아직 연결하지 않음 |
| 코스피200 시장 합계 | 거래일별 구성종목과 공매도 응답 조합 | 최신일 검증: 201종목 모두 관측 | 과거 전체 구간은 백필 후 검증. 코스피 전체 비중을 대신 넣지 않음 |
| SEIBro 대차잔고 | 검증된 자동 수집 endpoint 없음 | 자동 수집 미구현, null | SEIBro 종목별 대차거래현황 공식 내보내기를 정규화해 `--lending-csv`로 입력 가능. 실응답 자동 수집 성공을 주장하지 않음 |

KRX 웹 계정 환경변수와 Open API 키를 설정한 뒤 구성종목, 공매도 거래·잔고, 지수와 가격의 최소 조회를 확인했다. 키와 웹 로그인 계정은 서로 다른 인증 방식이다.

인증 전 백필은 지수 응답 실패로 중단됐다. 인증 후 2025-11-03부터 2026-11-03까지 245거래일의 백필을 완료했다. 최신 구성종목 201개와 거래일별 시장 집계가 생성됐으며 GitHub Actions 환경에서의 수집 성공은 아직 확인되지 않았다.

참고한 1차 문서: [pykrx 공식 README](https://github.com/sharebook-kr/pykrx/blob/master/README.md), [pykrx 1.2.8 릴리스](https://github.com/sharebook-kr/pykrx/releases/tag/v1.2.8), [원본 KRX 어댑터](https://github.com/sharebook-kr/pykrx/blob/master/pykrx/website/krx/market/core.py), [KRX Open API](https://openapi.krx.co.kr/contents/OPP/MAIN/main/index.cmd), [KRX 공매도 통계](https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd?locale=ko_KR), [SEIBro 메뉴](https://m.seibro.or.kr/cmmn/allView.do), [키움 REST API 가이드](https://openapi.kiwoom.com/m/guide/apiguide). 키움 API와 SEIBro 대체 수집은 이번에 실호출 검증하지 않았다.

## 파일 구조

```text
requirements-shorting.txt
config/short-selling.json           # 급증·숏커버 조건과 수동 섹터 프리셋
scripts/short_selling/
  sources.py                       # pykrx 원본 응답 + 공식 KRX 가격
  probe.py                         # 항목별 독립 프로세스·100초 제한 최소 검증
  collect.py                       # 백필·증분·출력 검증·교체/복구
  model.py                         # 합산·5/20일 평균·신호·랭킹
  tests/test_pipeline.py
schemas/short-selling.schema.json   # JSON Schema 2020-12
examples/short-selling/             # 합성 샘플; is_sample: true
  summary.json
  stocks.json
  history/005930.json
  history/035420.json
  market_history.json
  constituents.json
data/                              # 실제 수집 성공 후에만 생성
  summary.json
  stocks.json
  history/{code}.json
  market_history.json
  constituents.json                # 거래일별 구성종목; 과거 시장 합계 재현용
.shorting-cache/                    # Git 미추적 원본 체크포인트
logs/short-selling/                # Git 미추적, 자격증명 없는 로그
.github/workflows/short-selling-daily.yml
```

## 실행

Python 3.12 환경에서 저장소 루트를 작업 폴더로 실행한다.

```powershell
python -m pip install -r requirements-shorting.txt
python -m scripts.short_selling.probe
python -m scripts.short_selling.collect --sample
python -m unittest discover -s scripts/short_selling/tests -v

# 실제 수집: .env.local / .env 또는 환경변수의 KRX_ID, KRX_PW, KRX_API_KEY 사용
python -m scripts.short_selling.collect --backfill
python -m scripts.short_selling.collect
```

`--backfill`은 직전 완료 거래일 기준 365일 전부터 재수집한다. 일반 실행은 저장된 정상 JSON을 읽고 신규 거래일과 최근 10거래일을 갱신한다. 이 구간을 다시 조회하므로 늦게 발표된 잔고가 과거 실제 기준일에 들어간다. 더 오래된 정정은 `--backfill`로 반영한다. 구성종목 변경으로 새 종목의 과거 이력이 필요하면 해당 날짜 원본 캐시를 재사용하거나 재조회한다. 최신 구성종목의 편입 전 주가·공매도 이력도 원본에서 확보하되 시장 합계에는 당시 실제 구성종목만 넣는다.

초기 수집은 거래일당 구성종목·공매도·시세·잔고를 조회하므로 1천 회 안팎의 요청이 필요하다. 요청 간 기본 1초 간격, HTTP 타임아웃, Actions 최대 150분 제한을 둔다. 백필 중 정상 원본은 `.shorting-cache/`에 저장한다. 일반 실행으로 재개하면 오래된 완료 구간을 재사용한다. `--backfill`은 원본 캐시도 다시 수집한다. Actions는 캐시가 있으면 복원하지만 실패한 첫 실행의 캐시 저장을 보장하지 않는다.

`--as-of YYYY-MM-DD`로 완료된 특정 정규장 거래일을 지정할 수 있다. 미래·주말·확인된 휴장일·미확인 특수 세션은 거절한다. 현재 배치는 저장소의 검토된 `config/market-calendar.ts`를 공유하므로 연도가 바뀌면 캘린더 갱신이 필요하다. 주말/휴장일은 직전 완료 거래일을 선택하며 API가 해당 기준일을 제공하지 않으면 이전 날짜로 임의 후퇴하지 않는다.

예외 운영일은 확인 전 종목·지수 가격을 null로 보존하고 15:30 가격으로 표시하지 않는다. 과거 캘린더의 검토 범위 밖인 2025년 거래일은 원본 지수 날짜에 의존하므로 그 기간의 누락 거래일 검출은 제한된다. 관측이 없는 달력 날짜는 `session_status: no_observation`과 null이며, 휴장일이라고 단정하지 않는다. 프론트는 이 상태와 실제 거래일의 지표 결측을 구분해 표시해야 한다.

SEIBro 입력 형식(UTF-8 CSV):

```csv
date,code,quantity,published_at,source
2026-11-03,005930,123456,2026-11-04T09:00:00+09:00,SEIBro
```

위 수치는 형식 설명용이다. 실제 SEIBro 자료의 원본 기준일·발표시각을 사용한다. 발표시각이 확인되지 않은 자료에 임의 시각을 붙이면 안 된다. 입력이 없으면 대차 수량·증감·랭킹 모두 null/빈 배열로 남는다.

```powershell
python -m scripts.short_selling.collect --lending-csv path/to/verified-seibro.csv
```

## JSON 계약과 계산

모든 파일은 `schema_version`, `dataset_id`, `as_of`, `collected_at`, `period_start`, `price_basis`, `is_sample`, 단위 정보를 공유한다. `as_of`는 가격 기준 거래일, `collected_at`은 실제 수집 시각이다. `price_basis`는 **KRX / regular / 15:30:00 / Asia/Seoul / 비수정 종가**다. 기존 통합 종가 캐시는 이 버전에서 읽지 않는다. 서로 다른 `dataset_id` 파일을 프론트가 동시에 받으면 다시 읽어 일관성을 확보해야 한다.

- 금액은 원, 수량은 주, 비중은 0~100의 퍼센트다. JSON은 계산 정밀도를 유지하고 소수점 2자리·천 단위 표시는 프론트에서 적용한다.
- 공매도 거래비중은 공매도 원본 응답의 거래량/거래대금 분모로 계산한다. 공식 시세 API의 거래대금과 임의로 섞지 않는다. 공매도 원본의 KRX/NXT 거래 범위는 이번 응답 실패로 확인하지 못했으며 `flow_scope`에 미검증임을 기록했다. 공식 가격 필드의 KRX 15:30 기준과는 별개다.
- 시장 거래대금 비중 = 당시 구성종목 공매도 거래대금 합 / 당시 구성종목 전체 거래대금 합 × 100. 종목 비중의 단순평균을 사용하지 않는다. 하나라도 필요한 분자·분모가 누락되면 전체 값은 null이고 `coverage: incomplete`, 기대/관측 종목 수를 기록한다.
- `short_value_ratio_pct_mean_5/20`은 **당일을 제외한 직전 5/20거래일 비중의 산술평균**이다. 중간 결측이나 거래일 수 부족이면 null이다. `*_vs_mean_N_pct`는 `(당일/평균 − 1) × 100`, `*_change_1d`는 원래 단위의 차이다. 0인 평균과의 배율은 null이다.
- 일간 등락률은 두 날짜 모두 KRX 비수정 종가로 계산한다. 기업행사에 따른 가격 단절을 포함하므로 수정 수익률로 해석하지 않는다. 중간 거래일 가격이 없으면 null이며 다른 날짜로 건너뛰지 않는다.
- 순보유잔고는 실제 잔고 날짜의 행에만 기록한다. 최신 날짜의 자료가 없을 때 이전 잔고를 당일 값으로 채우지 않는다. `latest_disclosed_balance`는 별도 기준일을 가진 마지막 관측값이다. 잔고 Top10도 마지막 관측값과 각 기준일을 함께 담는다.
- `balance_status`: `reported` / `not_disclosed` / `publication_pending` / `unavailable`. 정상 빈 원본 응답은 최근 3거래일에는 발표 대기, 그보다 과거는 공시 관측 없음으로 표시한다. 3거래일은 상태 구분용 보수적 규칙이며 원본의 확정 발표 SLA를 뜻하지 않는다. 빈 응답만으로 미공시/미발표를 완전히 구별할 수 없다.
- 급증 플래그 기본: 당일 대금 비중 ≥ 직전 20일 평균 × 2. 평균/당일 결측이면 null. 급증 랭킹은 20일 평균 대비 증가한 종목의 상대 변화 상위 10개다.
- 숏커버링 보조 조건 기본: 직전 20거래일 공매도 대금 비중 고점 대비 당일 50% 이상 감소, 그 20거래일 첫날 종가 대비 3% 이상 상승. 조건·관측창은 `config/short-selling.json`에서 설정한다. 필요한 가격/비중이 하나라도 없으면 null이다.
- 섹터 원본은 검증하지 못했으므로 `sector`는 null이다. 통신/인터넷/게임/미디어/엔터/레저는 별도 수동 `sector_presets`이며 최신 구성종목과 교집합만 남긴다. 프리셋 외 공식 업종 필터를 제공하려면 별도 분류 소스를 검증해야 한다.

샘플은 2종목·35개 합성 거래 관측을 사용해 랭킹·평균·최근 잔고 지연·휴일 null을 확인하도록 만들었다. 전 파일 `is_sample: true`, 종목명에 `합성 샘플`을 넣었으며 운영 `data/`에 쓰는 것을 차단했다. 예제의 최신 기준일은 실제 최신 거래일이 아니다.

## 배치·실패·배포

GitHub Actions는 **평일 22:40 KST(13:40 UTC)** 에 실행한다. 장 마감 후 원본 반영을 기다리는 운영 시간이며 가격 기준은 여전히 15:30이다. 공시 지연은 늦은 cron만으로 해소되지 않으므로 최근 10거래일을 갱신한다. GitHub 예약 실행은 지연될 수 있다.

저장소 Secrets에 `KRX_ID`, `KRX_PW`, `KRX_API_KEY`가 필요하다. 공식 API는 유가증권 일별매매정보 이용 승인이 필요하며, 별도로 검증한 공식 지수 API 사용 시 KOSPI 시리즈 일별시세정보 승인도 필요하다. workflow 추가만으로 원격 예약 실행이 활성화되는 것은 아니며 기본 브랜치에 반영되어야 한다. 이번 작업에서 커밋·push·배포는 실행하지 않았다.

필수 API 실패·빈 필수 응답·스키마 변경·최신 지수 미발표 시 배치는 실패하고 기존 JSON을 보존한다. 정상 응답의 개별 종목 누락은 null로 저장한다. 원본 예외 메시지/HTTP 본문을 로그에 쓰지 않고 오류 클래스·단계·날짜만 남긴다. 로그와 probe 결과는 Actions artifact로 14일 보관한다. 모든 JSON의 스키마·세대 검증을 통과한 뒤 교체하며 로컬 쓰기 오류 시 이미 바꾼 파일도 복원한다. 프로세스 강제 종료/전원 장애의 여러 파일 교체까지 원자적으로 보장하지는 않으며 공개 배포의 일관성 경계는 Git 커밋이다.

수집 성공 후 지정된 공매도 파일만 커밋·push한다. 실패하면 해당 단계로 진행하지 않는다. 다른 데이터 workflow와 push가 겹치면 최신 기본 브랜치에 rebase하고 충돌 시 push하지 않는다. Next.js 배포는 빌드 시 공개 JSON을 생성한다. GitHub Pages의 별도 push workflow는 `GITHUB_TOKEN` 커밋으로 자동 실행되지 않을 수 있으므로 Pages를 사용할 경우 같은 workflow의 배포 job 또는 `workflow_run` 연결이 별도로 필요하다. Vercel Git 배포는 저장소 연결과 프로젝트 설정이 필요하다.

화면에 표시할 세 가지 필수 해석 주의사항은 `summary.json.warnings`에 포함한다. 프론트 구현 시 기준일·실제 수집 시각·잔고 자체 기준일·부족한 수집 범위도 함께 표시한다.

종목명 옆 관리·거래정지·투자주의·투자경고·투자위험은 네이버페이 증권의 관리·거래정지·시장경보 목록을 22:40 배치에서 별도로 수집한 `data/market_alerts.json`을 사용한다. 이 값은 가격 종가나 과거 기준일의 판정이 아니라 파일에 표시된 조회 시각에 확인한 경보 상태이며, 가격 기준일과 다를 수 있다. 종목 목록의 `marketAlertType`과 코드·페이지를 확인하고 가격 필드는 사용하지 않는다. 수집 실패 시 이전 스냅샷과 조회 시각을 유지하고 Actions 실패를 표시한다. 자료 자체를 읽지 못하면 화면에 확인 불가를 표시한다. 실시간 목록의 변경과 제공자의 응답 방식 변경에 따라 상태가 달라질 수 있다.
