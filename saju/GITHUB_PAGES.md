# 사주 GitHub Pages

웹 화면: https://leso12.github.io/saju/

이 경로는 정적 미리보기로, 입력·만세력 계산·예시 해석을 제공합니다.
Claude AI 실제 해석을 사용하려면 프로젝트의 Node/Vercel 서버를 별도 배포하고 서버 환경변수에 ANTHROPIC_API_KEY를 등록해야 합니다.
GitHub Pages에 API 키를 절대로 기록하지 마세요.

Vercel 배포 시 이 저장소를 import하고 Root Directory를 `saju`로 지정하면 됩니다.
배포된 백엔드를 GitHub Pages에서 호출하려면 CORS, 도메인 제한, 인증·요청 제한을 별도로 구성해야 합니다.
