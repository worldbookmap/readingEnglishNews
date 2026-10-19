# Reading English News

어제 인기 있었던 **The New Yorker**, **BuzzFeed**, **NYT Modern Love**, **Literary Hub**, **Wait But Why** 기사를 매일 자동으로 저장하고, 읽기 편하게 보여주는 개인용 웹앱입니다.

- **오늘의 기사**: 매일 아침 7시(KST)에 사이트별 인기 기사 5개를 불러와 Supabase에 저장합니다. 지난 날짜의 기사도 계속 남아 있습니다.
- **기사 추가**: 홈에서 원하는 기사 URL을 붙여넣으면 저장하고 바로 엽니다. 본문을 가져올 수 없는 사이트는 원문을 붙여넣어 읽습니다.
- **책**: 책을 직접 붙여넣거나 .txt · .epub · .pdf 파일을 불러오고(EPUB·PDF는 브라우저에서 텍스트로 변환하므로 파일 자체는 올라가지 않습니다. DRM이 걸린 EPUB, 글자 없이 스캔 이미지만 있는 PDF는 읽을 수 없습니다), [Project Gutenberg](https://www.gutenberg.org/)(OPDS 카탈로그), [Standard Ebooks](https://standardebooks.org/)(교정된 단일 페이지 HTML판), [Internet Archive](https://archive.org/details/texts)(스캔본 OCR 텍스트, 쪽 머리글·쪽 번호·줄 끝 하이픈을 정리)에서 공개 도서를 검색해 가져옵니다. 약 1,500단어씩 페이지로 나눠 (1), (2)… 로 넘기며 읽고, 다시 열면 마지막으로 읽던 페이지의 읽던 문단으로 돌아갑니다(기기가 달라도 이어집니다). 기사와 똑같이 단어·문장을 저장할 수 있습니다.
- **리더**: 단어를 누르면 영영 뜻(Wiktionary)이 보이고, 단어장에 저장할 수 있습니다. 저장한 단어에는 문맥이 된 문장과 출처 기사가 함께 남습니다.
- **문장 저장**: 단어를 누른 뒤 "이 문장 저장"을 누르거나, 원하는 부분을 드래그해서 저장합니다. 저장한 문장에는 메모(해석)를 달 수 있습니다. 저장한 단어와 문장은 **단어·문장** 탭에서 함께 봅니다.
- **암기장**: 기사에서 저장한 단어와 [studylang](https://studylangu.vercel.app/)(콜리·뱁찌 프로필)의 `type`이 `word`, `pattern`인 항목을 `단어: 뜻` 목록으로 보여줍니다. 뜻은 아주 희미하게 보이다가 누르면 또렷해집니다. 두 프로필은 "새로 불러오기" 버튼을 눌러 studylang의 `/api/entries?user=<프로필>`(Supabase 저장소)에서 함께 다시 가져옵니다.
- **읽은 글**: 기사를 열기만 하면 **클릭함**, 기사 화면의 "읽었음으로 표시" 버튼을 누르면 **읽었음**으로 기록됩니다. 언제든 다시 눌러 취소할 수 있습니다. 책갈피 버튼으로 **다시 읽을 글**을 고르면 따로 모아 보여줍니다.

Stack: Next.js 16 (App Router) · Supabase (Postgres) · Vercel (hosting + Cron)

## "인기 기사"를 고르는 기준

| 사이트 | 기준 |
| --- | --- |
| BuzzFeed | [buzzfeed.com/trending](https://www.buzzfeed.com/trending)의 순위 그대로 (BuzzFeed 자체 trending 피드) |
| The New Yorker | 공개된 "Most Popular" 목록이 없어서, **홈페이지 상단에 편집부가 배치한 순서**를 인기 순위 대신 사용 |
| Literary Hub | 마찬가지로 인기 목록이 없어서 **홈페이지 노출 순서** 사용 |
| NYT Modern Love | 주간 칼럼이라 [RSS 피드](https://www.nytimes.com/svc/collections/v1/publish/www.nytimes.com/column/modern-love/rss.xml)의 **최신 글** (팟캐스트 제외) |
| Wait But Why | 새 글이 드물어서 [RSS 피드](https://waitbutwhy.com/feed)의 **최신 글 1개** + 사이드바 **Popular Posts** 순서. 이미 저장한 글은 건너뛰므로, 처음 이후로는 새 글이 올라올 때만 추가됩니다 |

뉴욕타임스는 봇 차단과 유료 구독벽 때문에 서버에서 본문을 가져올 수 없습니다. 그래서 Modern Love는 제목, 요약, 링크만 저장합니다. 기사 화면에서 원문 본문을 복사해 붙여넣으면 다른 기사처럼 읽을 수 있습니다.

순위 수집 코드는 `src/lib/sources.ts`, 본문 추출 코드는 `src/lib/extract.ts`에 있습니다. 사이트 구조가 바뀌면 이 두 파일만 고치면 됩니다.

## 설정

### 1. Supabase

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에서 `supabase/migrations/` 안의 SQL 파일을 번호 순서대로(`0001_…`, `0002_…`) 실행합니다.
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
    books/                      책 목록·검색·직접 입력, books/[id] 페이지별 리더
    words/ memorize/ history/   단어·문장 · 암기장 · 읽은 글
    actions.ts                  저장/삭제/읽음 기록 server actions
    api/cron/fetch-articles/    매일 실행되는 수집 엔드포인트
  components/Reader.tsx         단어 클릭, 문장 선택, 사전 팝업
  lib/
    sources.ts                  사이트별 인기 기사 URL 수집
    extract.ts                  본문 추출 → 텍스트 블록 (원본 HTML은 저장하지 않음)
    ingest.ts                   수집 → 추출 → 저장
    tokenize.ts                 문장/단어 분리
    dictionary.ts               Wiktionary / dictionaryapi.dev 조회
    books.ts                    책 텍스트 → 문단 → 페이지 나누기, Gutenberg / Standard Ebooks / Internet Archive 검색·가져오기
    bookHtml.ts                 책 HTML(EPUB 장, Standard Ebooks) → 문단 (브라우저·서버 공용)
    bookFile.ts                 EPUB·PDF 파일 → 텍스트 (브라우저에서 실행)
supabase/migrations/0001_init.sql
```

> 개인 학습용 앱입니다. 저장한 기사 본문은 각 매체의 저작물이니 공개적으로 배포하지 마세요.
