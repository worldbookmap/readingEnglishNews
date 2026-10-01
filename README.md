# Reading English News

어제 인기 있었던 **The New Yorker**와 **BuzzFeed** 기사를 매일 자동으로 저장하고, 읽기 편하게 보여주는 개인용 웹앱입니다.

- **오늘의 기사**: 매일 아침 7시(KST)에 사이트별 인기 기사 5개를 불러와 Supabase에 저장합니다. 지난 날짜의 기사도 계속 남아 있습니다.
- **리더**: 단어를 누르면 영영 뜻(Wiktionary)이 보이고, 단어장에 저장할 수 있습니다. 저장한 단어에는 문맥이 된 문장과 출처 기사가 함께 남습니다.
- **문장 저장**: 단어를 누른 뒤 "이 문장 저장"을 누르거나, 원하는 부분을 드래그해서 저장합니다. 저장한 문장에는 메모(해석)를 달 수 있습니다.
- **읽은 글**: 한 번이라도 연 글은 읽은 날짜와 함께 계속 기록됩니다.

Stack: Next.js 16 (App Router) · Supabase (Postgres) · Vercel (hosting + Cron)

## "인기 기사"를 고르는 기준

| 사이트 | 기준 |
| --- | --- |
| BuzzFeed | [buzzfeed.com/trending](https://www.buzzfeed.com/trending)의 순위 그대로 (BuzzFeed 자체 trending 피드) |
| The New Yorker | 공개된 "Most Popular" 목록이 없어서, **홈페이지 상단에 편집부가 배치한 순서**를 인기 순위 대신 사용 |

순위 수집 코드는 `src/lib/sources.ts`, 본문 추출 코드는 `src/lib/extract.ts`에 있습니다. 사이트 구조가 바뀌면 이 두 파일만 고치면 됩니다.

## 설정

### 1. Supabase

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에 `supabase/migrations/0001_init.sql` 내용을 붙여넣고 실행합니다.
3. **Project Settings → API**에서 `Project URL`과 `service_role` 키를 복사해 둡니다.

모든 DB 접근은 서버에서 service-role 키로만 이뤄집니다. 테이블에는 RLS가 켜져 있고 정책이 없으므로 anon 키로는 아무것도 읽을 수 없습니다.

### 2. 로컬 실행

```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev
```

http://localhost:3000 에서 **지금 불러오기**를 누르면 바로 기사를 가져옵니다.

### 3. GitHub → Vercel 배포

1. 이 저장소를 GitHub에 push합니다.
2. Vercel에서 **Add New → Project**로 저장소를 import합니다.
3. **Environment Variables**에 `.env.example`의 값을 모두 넣습니다. `APP_PASSWORD`는 꼭 설정하세요. 비워두면 URL을 아는 누구나 앱을 열 수 있습니다.
4. Deploy. `vercel.json`의 Cron(`0 22 * * *` UTC = 매일 07:00 KST)이 자동으로 등록됩니다.

Cron을 직접 실행해보려면:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/fetch-articles
```

## 구조

```
src/
  proxy.ts                      비밀번호 게이트 (Next 16의 middleware)
  app/
    page.tsx                    오늘/지난 인기 기사
    articles/[id]/page.tsx      리더
    words/ sentences/ history/  단어장 · 문장 · 읽은 글
    actions.ts                  저장/삭제/읽음 기록 server actions
    api/cron/fetch-articles/    매일 실행되는 수집 엔드포인트
  components/Reader.tsx         단어 클릭, 문장 선택, 사전 팝업
  lib/
    sources.ts                  사이트별 인기 기사 URL 수집
    extract.ts                  본문 추출 → 텍스트 블록 (원본 HTML은 저장하지 않음)
    ingest.ts                   수집 → 추출 → 저장
    tokenize.ts                 문장/단어 분리
    dictionary.ts               Wiktionary / dictionaryapi.dev 조회
supabase/migrations/0001_init.sql
```

> 개인 학습용 앱입니다. 저장한 기사 본문은 각 매체의 저작물이니 공개적으로 배포하지 마세요.
