# 두 명의 명리학자가 바라본 나 — 사주 웹사이트

생년월일·달력 종류·출생시간·성별·출생지·현재 고민을 입력하면 **만세력 계산은 브라우저에서**, **Claude 해석은 서버에서** 처리하는 웹사이트입니다.

- 사주 네 기둥, 십성, 오행, 합·충, 대운, 세운 표시
- 두 명리학자(A: 직설적 현실파 / B: 신중한 정통파)의 독립적인 비교 해석
- 모바일 반응형 열람, 데스크톱 A4 결과지, 인쇄/PDF 저장
- Claude **Structured Outputs(JSON Schema)** 을 사용한 안정적인 응답 형식
- 사용자가 명식을 변경하면 과거 AI 해석을 즉시 지우고, 진행 중인 요청은 무효화
- API 키는 서버 환경 변수에만 두며 프런트엔드에는 노출하지 않음

> 사주는 과학적으로 검증된 개인 미래 예측이 아닙니다. 건강·재무·진로 판단을 대체하지 않으며 문화적/오락적 해석에 해당합니다.

## 폴더 구조

```text
saju-web/
├─ public/
│  ├─ index.html          입력 화면, 만세력, 반응형 표시, 인쇄 CSS
│  └─ vendor/lunar.js     lunar-javascript 1.6.12 (MIT)
├─ api/reading.js         Vercel 서버 함수 /api/reading
├─ lib/reading.js         입력 검증, JSON Schema, Claude API 서버 호출, 제한
├─ server.js              로컬 Node.js 서버
├─ tests/reading.test.js  오프라인 단위·모의 API 테스트
├─ vercel.json            Vercel 서버 함수 최대 실행시간
├─ .env.example           환경변수 예시(키 없음)
├─ .gitignore             API 키 파일 업로드 방지
└─ package.json
```

## 로컬에서 실행

Node.js **20 이상** 준비 후 프로젝트 폴더(`package.json`이 있는 폴더)에서:

```bash
# Windows CMD
copy .env.example .env
# macOS/Linux
# cp .env.example .env
```

`.env` 파일에서 `ANTHROPIC_API_KEY=sk-ant-...` 값에 **본인의 키**를 입력하고:

```bash
npm start
```

[http://localhost:3000](http://localhost:3000)으로 접속합니다. API 키가 없어도 예시 화면과 명식 계산은 확인할 수 있지만, **실제 AI 해석은 작동하지 않습니다.**

테스트는 외부 인터넷이나 실결제 없이 `npm test`로 실행할 수 있습니다.

## Vercel 배포 (가장 간단한 방법)

1. ZIP 압축 해제 후 **`package.json`, `public/`, `api/`, `vercel.json`이 같은 최상위 위치**에 있도록 GitHub 저장소에 올립니다. `.env`는 절대 올리지 않습니다.
2. [Vercel](https://vercel.com/)에서 **Add New → Project → Git Repository**를 선택하고 저장소를 연결합니다.
3. Framework Preset은 **Other**, Build Command는 **Override를 활성화한 후 공란**, Output Directory는 기본값(프로젝트 설정에 따라 정적 `public` 폴더 사용)으로 둡니다. Root Directory가 정확히 `package.json`이 있는 곳인지 확인합니다.
4. **Settings → Environment Variables**에 `ANTHROPIC_API_KEY`를 입력하고 Production(필요하면 Preview도) 환경에 적용합니다. `.env` 내용 자체를 Vercel에 업로드할 필요는 없습니다.
5. Deploy 후 `https://프로젝트명.vercel.app`에 접속해 실제 동작을 점검합니다. 환경 변수를 추가·수정했다면 **Redeploy**가 필요할 수 있습니다.

`api/reading.js`는 서버 함수로 실행됩니다. **GitHub Pages 같은 정적 호스팅만으로는 Claude 호출이 작동하지 않습니다.** Anthropic API에 접근할 수 있는 Node 서버 또는 서버리스 함수가 필요합니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **필수** | [Anthropic Console](https://console.anthropic.com/)에서 발급한 개인 API 키 |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | 서버에서 사용할 Claude 모델 ID. 계정 권한에 따라 변경 가능 |
| `RATE_LIMIT_PER_HOUR` | `10` | 동일 서버 인스턴스에서 IP당 시간당 요청 상한 |
| `PORT` | `3000` | 로컬 Node 서버 포트 |

**중요한 공개 운영 주의사항**

- 위의 요청 제한은 **서버 프로세스의 메모리 기반**입니다. Vercel은 인스턴스마다 메모리가 달라 공격자/봇으로 인한 과금의 충분한 방어책이 아닙니다. 대외 공개 전 Vercel 방화벽/Rate Limiting, Turnstile 또는 Redis 같은 공유 카운터, 사용자 인증 등을 추가하세요.
- Anthropic Console에 **지출 한도/경고**를 설정하고 처음에는 낮은 한도로 테스트하세요. API 과금은 Claude 구독과 별개입니다.
- 방문자가 입력한 생년월일, 성별, 출생지, 현재 고민은 AI 요청 시 Anthropic으로 전송됩니다. 현재 프로젝트 자체에는 저장 DB가 없지만 플랫폼의 요청 로그나 API 제공자의 보존 정책까지 **'어디에도 저장되지 않는다'고 보장할 수는 없습니다.** 운영 전 개인정보처리방침과 보존·동의 절차를 확인해야 합니다.
- 입력에 실명이나 연락처 등 민감한 정보를 쓰지 않도록 안내하는 것이 좋습니다.
- 사용자 제공 `chart`가 완전히 신뢰 가능한 것은 아닙니다. 지금 서버는 구조·길이·기본 일관성을 검사하지만 **출생 정보에서 명식을 서버 자체가 재산출하여 대조하지는 않습니다.** 유료 서비스로 확장하려면 서버 재산출/검증을 추가하세요.

## 만세력 계산 범위

- `lunar-javascript`로 양력/음력(윤달 포함) 변환 및 절기 기준 팔자와 대운을 계산합니다.
- **경도 기준 시각 보정**은 한국의 시차·서머타임 표를 적용하되 **균시차(Equation of Time)는 계산하지 않습니다.** 따라서 '정확한 진태양시'라고 부르지 않으며, 출생 시간이 시주/일주 경계 부근이면 전문 만세력 결과와 교차 검증해야 합니다.
- 한국 주요 도시 기준입니다. **해외 출생은 정확한 현지 역사적 시차/서머타임을 지원하지 않아 보정 없음**을 제공합니다.
- 출생시간이 불확실하면 `시간 모름`을 체크하고 시주를 빼고 봅니다. 일주 교체 시점은 라이브러리의 야자시 기준으로 처리합니다.
- 모바일 화면은 세로 읽기용이고, **A4 인쇄 시 레이아웃은 데스크톱 규격**입니다. 내용이 넘치는 경우 데스크톱에서 줄인 해석을 재요청하세요.

## 검증 범위

`npm test`는 명식 입력 검증, 잘못된 날짜/명식 거절, 구조화 출력 파싱, 키 누락, 모의 Anthropic HTTP 요청을 검증합니다. 실제 Anthropic API 호출과 Vercel 실배포는 소유자의 API 키/계정이 없으므로 여기서 수행하지 않았습니다.
