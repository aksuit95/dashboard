# 일별 자동 갱신

| 항목 | 한국시간 | 실행 위치 |
| --- | --- | --- |
| 미국 ADR·환율 | 매일 오전 7시 | GitHub Actions `proxy-us-close.yml` (`0 22 * * *`, UTC) |
| 한국 프록시 종가·수급·섹터·미너비니 | 평일 오후 4시 | GitHub Actions `sector-daily.yml` (`0 7 * * 1-5`, UTC) |
| CNN 공포·탐욕 지수 | 매일 오전 10시 | Vercel Cron `/api/cron/fear-greed` (`0 1 * * *`, UTC) |

프록시 작업은 `data/proxy-close/board.json`을 검증 후 커밋하고 Vercel Git 배포를 유발합니다. 한국의 기준일 KRX Open API 종가와 네이버 명시적 정규장 종가 이력을 대조합니다. 가격 기준은 **KRX 15:30**이며 수집 시각과 구분합니다. 한국·미국 휴장일은 해당 시장의 직전 완료 거래일을 사용합니다. ADR은 미국 종가, 환율은 Yahoo 일별 값이며 각각의 날짜를 표시합니다. 자료 누락·두 국내 소스 불일치·미국 종가 지연 시 기존 정상 파일을 유지하고 실패를 기록합니다. 두 GitHub 워크플로는 같은 concurrency 그룹으로 파일 업데이트 충돌을 방지합니다. 오전 7시의 UTC 날짜는 한국 날짜보다 하루 전입니다.

GitHub 예약 및 Vercel 배포는 지연될 수 있습니다. `KRX_API_KEY`는 GitHub Actions Secrets에 필요합니다. `npm run proxy-close:export`로 로컬에서 수동 수집할 수 있습니다. 화면 조회는 배포된 파일만 읽습니다. 데이터 수집 전에 가격·과거 이력을 KRX 정규장 기준으로 확인하며 기존 Yahoo 국내 가격이나 통합 종가 캐시는 사용하지 않습니다.

CNN 예약에는 Vercel Production 환경의 `CRON_SECRET`이 필요합니다. Hobby Cron은 오전 10시부터 11시 사이에 실행될 수 있습니다. 실패는 View Logs에서 확인하며 최초 요청도 같은 일별 수집을 시도합니다.
