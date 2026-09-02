# 웹툰 원본 뷰어 Android v1.0

대용량 세로 웹툰 원본을 Android에서 읽기 위한 전용 뷰어.

## 지원
- PNG / JPG / JPEG / WEBP / BMP
- ZIP / CBZ 내부 이미지 직접 목록화
- ZIP64 및 큰 ZIP: 전체 압축파일을 앱 캐시에 복제하지 않고 SeekableByteChannel로 중앙 디렉터리를 읽음
- ZIP 내부에서 현재 읽는 이미지만 앱 임시 캐시에 추출
- 폴더 재귀 탐색 및 숫자 자연 정렬

## 대용량 렌더링
초장문 PNG를 한 번에 Bitmap으로 디코딩하지 않는다.
BitmapRegionDecoder를 이용해 현재 화면 주변을 타일 단위로 비동기 디코딩한다.
저해상도 미리보기를 뒤에 유지해 빠른 스크롤 중 빈 화면/검은 플래시를 줄인다.

## 기본 기능
- 파일/ZIP 열기, 폴더 열기
- 회차 목록, 이전/다음
- 읽던 회차 + 스크롤 위치 저장
- 95% 도달 시 읽음 표시
- 즐겨찾기
- 맞춤 너비 / 100%
- 핀치 줌 / 더블탭
- 드래그 / 플링 스크롤
- UI 숨김(화면 탭)
- 배경색 순환
- 화면 밝기
- 화면 켜짐 유지
- 끝에서 다음 화 자동 이동
- ZIP 임시 이미지 캐시 정리

## ZIP 파일명
일반 UTF-8 ZIP은 UTF-8 플래그를 따르고, 플래그가 없는 오래된 한국어 ZIP은 MS949를 기본 fallback으로 사용한다.

## Android
- minSdk 26
- targetSdk 35
- package: com.leso12.webtoonviewer
