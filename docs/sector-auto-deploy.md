# 섹터 데이터 자동 배포

GitHub Actions `sector-daily.yml`이 평일 16:00 KST에 KRX 정규장 종가를 수집합니다. 휴장일에는 마지막 완료 거래일을 재사용하고 데이터가 바뀌지 않으면 배포하지 않습니다. 두 지수와 최근 30일 조회용 데이터를 검증한 뒤 `data/sectors/board.json`만 커밋·푸시하며 기존 GitHub–Vercel 연결이 Production 배포를 시작합니다. 수집 실패 시 기존 파일을 보존하고 세 번까지 재시도합니다.

수집 및 빌드가 끝난 뒤 새 데이터가 공개됩니다. GitHub 예약 작업은 정각 실행이 지연될 수 있으며 배포 성공 여부는 GitHub Actions와 Vercel 배포 상태에서 확인합니다. 작업의 수동 실행은 Actions의 `Collect sectors and deploy to Vercel`에서 가능하며 `force`를 선택하면 같은 거래일도 재수집합니다. 이 작업은 PC가 켜져 있을 필요가 없습니다.

화면 API는 배포에 포함된 JSON을 읽으며 실시간 재수집을 하지 않습니다. 데이터에는 현재 지수 구성과 섹터 분류를 이용한 과거 가격 비교가 포함되므로 과거 편입·편출을 재현하지 않습니다. JSON은 공개 저장소와 배포 사이트의 접근 권한을 따릅니다.
