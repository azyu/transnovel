---
version: alpha
name: TransNovel Landing
description: Design system for the TransNovel GitHub Pages site (docs/index.html, docs/quickstart.html). Dark, calm, technical — built to feel like a trustworthy desktop tool, not a marketing splash page.
colors:
  bg: "#08090c"
  surfaceSolid: "#111419"
  textBase: "#ffffff"
  border: "#ffffff"
  accent: "#3b82f6"
  accentBright: "#60a5fa"
  ambientPurple: "#8b5cf6"
  ambientGreen: "#10b981"
  trafficClose: "#ff5f57"
  trafficMinimize: "#febc2e"
  trafficMaximize: "#28c840"
typography:
  display:
    fontFamily: "Inter, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "clamp(2.8rem, 8vw, 5rem)"
    fontWeight: 800
    lineHeight: 1
  h2Section:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(1.75rem, 4vw, 2.35rem)"
    fontWeight: 750
    lineHeight: 1.2
  h3:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
  bodyLead:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.8
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  eyebrow:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  pill:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.02em"
  buttonLg:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.9375rem"
    fontWeight: 600
  buttonSm:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.875rem"
    fontWeight: 600
  code:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.9em"
    fontWeight: 400
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  2xl: 16px
  pill: 9999px
spacing:
  navbarHeight: 4rem
  scrollPadding: 5rem
  containerMax: 72rem
  sidebarWidth: 14rem
  sectionGap: 4rem
  cardPadding: 1.5rem
  cardPaddingSm: 1.25rem
  buttonPaddingX: 1.5rem
  buttonPaddingY: 0.75rem
  buttonPaddingXSm: 1rem
components:
  navbar:
    height: "{spacing.navbarHeight}"
    backgroundColor: transparent
    textColor: "{colors.textBase}"
    typography: "{typography.body}"
  navbarScrolled:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.textBase}"
    height: "{spacing.navbarHeight}"
  eyebrowPill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accentBright}"
    typography: "{typography.pill}"
    rounded: "{rounded.pill}"
    padding: "0.375rem 1rem"
  sectionEyebrow:
    textColor: "{colors.accentBright}"
    typography: "{typography.eyebrow}"
  appFrame:
    backgroundColor: "{colors.surfaceSolid}"
    rounded: "{rounded.xl}"
  appFrameTitlebar:
    backgroundColor: "{colors.textBase}"
    height: 36px
    padding: "0 12px"
  bentoCard:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.cardPadding}"
  bentoCardHover:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.2xl}"
  siteCard:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.xl}"
    padding: "{spacing.cardPaddingSm}"
  siteCardHover:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.xl}"
  downloadCard:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.xl}"
    padding: "{spacing.cardPadding}"
  btnPrimary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.textBase}"
    typography: "{typography.buttonLg}"
    rounded: "{rounded.lg}"
    padding: "{spacing.buttonPaddingY} {spacing.buttonPaddingX}"
  btnPrimaryHover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.textBase}"
    rounded: "{rounded.lg}"
  btnGhost:
    backgroundColor: transparent
    textColor: "{colors.textBase}"
    typography: "{typography.buttonLg}"
    rounded: "{rounded.lg}"
    padding: "{spacing.buttonPaddingY} {spacing.buttonPaddingX}"
  btnGhostHover:
    backgroundColor: "{colors.textBase}"
    textColor: "{colors.textBase}"
    rounded: "{rounded.lg}"
  btnDownload:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.textBase}"
    typography: "{typography.buttonSm}"
    rounded: "{rounded.md}"
    padding: "{spacing.buttonPaddingY} {spacing.buttonPaddingXSm}"
    width: "100%"
  btnDownloadLoading:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.textBase}"
    rounded: "{rounded.md}"
  faq:
    textColor: "{colors.textBase}"
    typography: "{typography.body}"
  docHero:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.textBase}"
    padding: "7rem 0 4rem"
  docSection:
    textColor: "{colors.textBase}"
    typography: "{typography.body}"
    padding: "0 0 4rem"
  docCallout:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.textBase}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.125rem"
  docCard:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.lg}"
    padding: "1.125rem"
  docTable:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.lg}"
  docNext:
    backgroundColor: "{colors.textBase}"
    rounded: "{rounded.xl}"
    padding: "{spacing.cardPadding}"
  trafficLightClose:
    backgroundColor: "{colors.trafficClose}"
    rounded: "{rounded.pill}"
    size: 10px
  trafficLightMinimize:
    backgroundColor: "{colors.trafficMinimize}"
    rounded: "{rounded.pill}"
    size: 10px
  trafficLightMaximize:
    backgroundColor: "{colors.trafficMaximize}"
    rounded: "{rounded.pill}"
    size: 10px
  featureIcon:
    rounded: "{rounded.lg}"
    size: 40px
  orbAmbient:
    rounded: "{rounded.pill}"
---

## Overview

TransNovel은 일본 웹소설을 한국어로 번역하는 Tauri 데스크톱 앱이고, 이 디자인 시스템은 그 앱을 소개하는 GitHub Pages 사이트(`docs/`)에만 적용된다. 데스크톱 앱 본체(`src/`)의 UI는 별개 시스템이며 이 문서의 적용 대상이 아니다.

톤은 **dark, calm, technical**이다. 사용자가 "이거 가벼운 마케팅 페이지가 아니라 실제로 굴러가는 도구구나"라고 느끼게 만드는 것이 목표였다. 따라서 형광 색·과도한 그라디언트·스크롤 jacking·자극적 카피는 의도적으로 배제했다. 참조한 시각 언어는 `vmlx.net` 류의 차분한 다크 톤 SaaS 랜딩이다.

기술적 결정:

- **빌드 스텝 없는 정적 사이트**(HTML + Tailwind Play CDN + 단일 `custom.css` + 단일 `main.js`). 페이지 한 명짜리 사이트에 빌드 파이프라인을 만들 가치가 없다고 판단.
- **단색 다크만 지원**(라이트 모드 없음). 앱이 다크 우선이라는 정체성과 정렬.
- **Korean 1차 / English secondary**: 본문은 한국어, 영어 README는 별도. 페어링 폰트(Inter + Noto Sans KR)로 두 언어를 동일 비주얼 무게로 맞춘다.
- **CSS 변수 기반 토큰**: 색은 모두 `:root` 변수에서 관리(`docs/css/custom.css:2-11`). 이 DESIGN.md는 그 변수들의 *문서이자 계약*이다. CSS를 바꾸면 이 문서도 같은 PR에서 갱신해야 한다.

## Colors

표면 색은 단 두 단계 — `bg`(`#08090c`)와 `surfaceSolid`(`#111419`). 그 외 모든 카드·navbar 배경은 **흰색 알파 오버레이**(`rgba(255,255,255,0.025)` ~ `0.06`)로 만든다. 이렇게 하면 새 surface 토큰을 추가할 필요 없이 깊이감만 alpha로 조절할 수 있다.

텍스트는 흰색 알파 3계층:

| 토큰 | 값 | 용도 |
|---|---|---|
| `textPrimary` | `rgba(255,255,255,0.92)` | 본문, 헤드라인 |
| `textSecondary` | `rgba(255,255,255,0.52)` | 부연·리드·테이블 셀 |
| `textTertiary` | `rgba(255,255,255,0.30)` | 사이드바 inactive·메타 |

보더도 동일하게 `rgba(255,255,255,0.06)`(`border`)와 `0.12`(`borderHover`) 두 단계만.

**강조색은 `accent`(#3b82f6)와 `accentBright`(#60a5fa) 두 가지뿐**이다. 둘은 hover/glow 페어로 함께 다닌다(예: 버튼 base = `accent`, hover glow = `accent` 25% 알파).

`ambientPurple`/`ambientGreen`은 **hero 영역 ambient orb 전용**이다. 일반 컴포넌트(버튼·뱃지·링크)에 절대 쓰지 않는다. 이걸 풀어주면 단색 다크라는 정체성이 무너진다.

`traffic*` 3색은 `app-frame` 타이틀바의 macOS 신호등 픽토그램에만 쓴다.

> 알파 변형이 별도 토큰이 아닌 이유: front matter 스펙(sRGB hex만 허용)을 우회하려고 토큰을 16개로 늘리는 것보다, base hex 5개를 두고 컴포넌트에서 알파를 합성하는 편이 유지가 쉽다. 트레이드오프는 머신 리딩이 한 단계 약해진다는 점.

## Typography

폰트 페어링은 **Inter + Noto Sans KR**. Inter는 라틴 글자 가독성과 가변 weight를 위해, Noto Sans KR은 한글 무게가 Inter와 시각적으로 매칭되기 때문에 골랐다. system fallback은 `system-ui`까지만(테스트되지 않은 후순위 폰트가 들어가서 들쑥날쑥하지 않게).

가중치 스케일은 **400 / 500 / 600 / 650 / 700 / 750 / 800**.
650/750 같은 비표준 step은 가변 폰트 기능을 활용하는 것으로, 텍스트가 600(semibold)에서 700(bold)으로 한 번에 점프할 때 너무 굵어지는 것을 방지하기 위한 중간값이다. doc-section h2(750)·h3(650)에 사용.

크기 결정:

- **Display**(hero h1): `clamp(2.8rem, 8vw, 5rem)` — 모바일에서도 인상적이되 폭주하지 않도록 하한·상한을 둔다.
- **Section h2**: `clamp(1.75rem, 4vw, 2.35rem)`.
- **Body**: 본문 1rem / line-height 1.7. 리드 단락만 1.125rem / 1.8.
- **Eyebrow**: 0.8125rem + uppercase + letter-spacing 0.08em — 섹션 도입부의 톤 변환.

코드 인라인은 0.9em으로 본문보다 살짝 작게, 흰색 알파 6% surface + 보더로 감싼다.

## Layout

- 컨테이너 폭: `max-w-6xl`(72rem). 모든 섹션이 이 폭을 따른다.
- 가로 패딩: `px-6` 일관.
- Navbar: 높이 64px(`4rem`), `position: fixed`. scroll-padding-top은 `5rem`로 앵커 점프 시 navbar에 가리지 않게.
- Hero·Feature·Site·Download·FAQ 섹션은 세로 간격을 큰 패딩(보통 `py-20` ~ `py-32`)으로 분리. 구분선 없음 — 다크 배경 위에서 빈 여백 자체가 구분선이다.
- Quickstart 페이지(`doc-layout`)만 그리드: `14rem` 사이드바 + 본문(`1fr`), 1023px 이하에서 1열로 무너지고 사이드바 nav가 가로 배치로 전환된다.
- Breakpoints는 `1023px`(태블릿·데스크톱 분리)와 `767px`(모바일) 두 개만 사용. Tailwind의 `lg`(1024)와 `md`(768) 경계에 맞춤.

## Elevation & Depth

평면 다크가 기본이다. 깊이는 두 가지 메커니즘으로만 표현한다.

1. **`.app-frame` 그림자 + accent glow**: hero 영역의 앱 스크린샷 프레임. `box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 80px rgba(59,130,246,0.04)`. 페이지 전체에서 *유일하게 강한 그림자*다.
2. **Ambient orb**: `.orb-1/2/3` 세 개의 큰 원이 `filter: blur(120px)`로 hero 뒤에서 천천히 떠다닌다. 각각 accent blue / purple / green을 5~8% 알파로 사용. 이게 다크 배경을 *완전히 평평하지 않게* 만드는 유일한 장치.

`.bento-card`의 미세한 그림자는 의도적으로 없다 — 카드는 보더와 hover shimmer만으로 분리감을 준다.

새 그림자 토큰을 만들 때는 위 두 케이스 외에 *진짜로* 필요한지 다시 생각해야 한다. shadow를 늘리는 순간 사이트가 가벼워진다.

## Shapes

`rounded` 6단계 — 각 단계가 어디 쓰이는지가 정해져 있다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `sm` | 6px | 인라인 코드, focus outline |
| `md` | 8px | btn-download, 작은 컨트롤 |
| `lg` | 10px | btn-primary / btn-ghost, doc-callout, doc-card, doc-table 컨테이너 |
| `xl` | 12px | site-card, download-card, app-frame, doc-next |
| `2xl` | 16px | bento-card |
| `pill` | 9999px | eyebrow-pill, traffic light, ambient orb, status dot |

새 컴포넌트는 위 6개 중 하나에 맞춘다. 7번째 값은 추가하지 않는다.

## Components

### Navbar (`nav` + `.nav-scrolled`)

- 기본은 transparent. 스크롤 후 `.nav-scrolled`가 토글되면서 `rgba(8,9,12,0.8)` + `backdrop-filter: blur(24px) saturate(1.3)` + 하단 보더가 들어간다.
- 데스크톱: 로고 + 5개 텍스트 링크 + GitHub 아이콘 + 다운로드 CTA.
- 1023px 이하: 텍스트 링크가 햄버거로 접힘(`#mobile-menu`).

### Eyebrow Pill (`.eyebrow-pill`)

Hero 섹션 머리에 1회만 등장. accent blue 8% 배경 + 20% 보더 + accent-bright 텍스트. 안쪽 `.dot`는 6px 원이 2초 주기로 0.4 ↔ 1.0 사이 알파 펄스. **사이트당 1회만** 사용한다.

### App Frame (`.app-frame` + `.app-frame-titlebar`)

Hero의 앱 스크린샷 컨테이너. 36px 높이 타이틀바에 macOS 신호등 3개(`.traffic-close/-minimize/-maximize`). 컨텐츠 영역은 `#111419`(`surfaceSolid`). 이게 페이지 유일한 "creative" 컴포넌트이며, 데스크톱 앱이라는 정체성을 한눈에 전달하는 역할.

### Bento Card (`.bento-card`)

Features 섹션의 격자 카드. 16px(`rounded.2xl`) 보더 카드 + hover 시 *대각선 shimmer*가 0.8s에 한 번 지나간다. shimmer는 `::before`에 `linear-gradient`를 깔고 `translateX`로 통과시키는 트릭. hover 인터랙션은 이게 전부다 — 위로 뜨거나 그림자가 자라지 않는다.

### Site / Download Card (`.site-card`, `.download-card`)

`bento-card`보다 한 단계 작은 12px 카드. `.site-card`만 hover 시 `translateY(-2px)` 미세 부양이 있고, `.download-card`는 보더 색만 바뀐다. 카드 톤을 두 종류로 분리해 *기능 강조 vs 단순 정보 나열*을 구분.

### Buttons

- `.btn-primary` — accent 배경 + glow 그림자 + inset 1px 화이트 하이라이트. hover는 `filter: brightness(1.15)` + glow 강화. 페이지에 1~2회만 등장.
- `.btn-ghost` — transparent + 보더. primary 옆 보조 액션.
- `.btn-download` — primary와 비슷하지만 카드 안에 들어가도록 `width: 100%` + 작은 padding + `rounded.md`. `.loading` 변형은 `pointer-events: none; opacity: 0.5`.

### FAQ (`details` / `summary`)

네이티브 `<details>` 사용. `summary::after`에 `+` 글리프를 두고 `[open]` 상태에서 45도 회전. 별도 JS 없음. focus-visible은 accent 2px outline + 4px radius로 키보드 접근성 보장.

### Quickstart Doc Components

`.doc-hero`(상단 7rem padding, accent radial 그라디언트 2개), `.doc-layout`(사이드바+본문 그리드), `.doc-section`(섹션마다 4rem 하단 보더), `.doc-callout`(accent blue tint 알림 박스), `.doc-card`(2열 그리드 카드), `.doc-table`(헤더 + 행 hover 없음, 단순 정보 테이블), `.doc-next`(페이지 끝 next-step 박스). 이들은 `quickstart.html` 전용이며 다른 페이지로 끌고 가지 않는다.

### Animations

| 이름 | 사용처 | 길이 | 비고 |
|---|---|---|---|
| `fadeUp` | `[data-animate]` 요소가 뷰포트 진입 시 | 0.7s | `IntersectionObserver`로 트리거 |
| `cardShimmer` | bento-card hover | 0.8s | `::before` translate |
| `pulse-dot` | eyebrow-pill `.dot` | 2s | infinite |
| `orbFloat1/2/3` | ambient orb | 20~28s | infinite, easing 다름 |

`@media (prefers-reduced-motion: reduce)`에서 모든 애니메이션·transition을 사실상 비활성(`0.01ms`). 새 애니메이션을 추가할 때 이 가드를 깨면 안 된다.

## Do's and Don'ts

### Do

- **새 surface는 `rgba(255,255,255,0.025)` + `var(--border)` 조합으로** 만든다. surface 토큰을 늘리지 말 것.
- **강조 색은 `--accent` / `--accent-bright`만** 쓴다. 두 변수는 항상 페어로 다닌다.
- **카드는 `rounded` 6단계 중 하나에 맞춘다**: `xl`(12px) 일반 카드, `2xl`(16px) bento, `lg`(10px) 작은 박스.
- **새 애니메이션은 `prefers-reduced-motion`에서 자동 비활성**되어야 한다(글로벌 가드가 처리하지만, `transition` 외 타이밍을 직접 제어하면 직접 막아야 함).
- **CSS를 바꾸면 이 DESIGN.md를 같은 PR에서 갱신**한다. 둘이 어긋나면 이 문서가 거짓이 된다.

### Don't

- **`gradient-text`/`gradient-text-accent`를 본문에 쓰지 말 것**. 헤드라인(hero h1, section h2 일부) 한정. 본문에 그라디언트 텍스트를 깔면 사이트가 즉시 가벼워진다.
- **`app-frame` 외에 강한 그림자를 만들지 말 것**. 카드는 보더로만 분리한다.
- **`ambientPurple`/`ambientGreen`을 일반 UI에 쓰지 말 것**. 이 두 색은 hero 뒤 ambient orb 전용 — 단색 다크 정체성을 유지하기 위한 약속.
- **새 hue를 추가하지 말 것**. 새 색을 넣고 싶다면 먼저 기존 토큰의 알파 변형으로 해결되는지 검토.
- **새 `rounded` 단계를 추가하지 말 것**. 7번째 값을 만들기 시작하면 곧 14개가 된다.
- **font-family 스택을 변경하지 말 것**. 한국어 본문이 있는 한 Inter + Noto Sans KR 페어링은 비교 대상이 없다.
- **빌드 스텝(번들러·PostCSS 파이프라인)을 도입하지 말 것**. 페이지 2장짜리 사이트에 빌드 시스템을 들이는 순간 유지비가 콘텐츠 가치보다 커진다. Tailwind를 정식 빌드로 옮기고 싶다면 *그것 자체를 별도 결정*으로 다룬다.
- **모바일 단독 디자인을 만들지 말 것**. 모든 컴포넌트는 데스크톱 우선 + 1023/767 단계로 무너지는 단일 디자인이어야 한다.
