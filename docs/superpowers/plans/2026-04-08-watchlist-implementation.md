# Watchlist Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `관심작품` prototype for Syosetu work pages with persistent tracked works, startup background checks, manual refresh, and separate viewed-episode tracking.

**Architecture:** Add a dedicated Rust watchlist service backed by new SQLite tables, expose thin Tauri commands for registration, refresh, list loading, and viewed-episode updates, then reshape the existing `series` frontend into a watchlist UI while keeping the internal tab key unchanged. Reuse the existing Syosetu parser and translation screen state instead of inventing a second parsing or reading flow.

**Tech Stack:** Tauri 2.0, Rust, sqlx/sqlite, React 19, Zustand, Vitest

---

## File Structure

### Backend

- Create: `src-tauri/src/db/migrations/005_watchlist.sql`
  Creates `watchlist_items`, `watchlist_episodes`, and `viewed_episodes`.
- Modify: `src-tauri/src/db/mod.rs`
  Loads the new migration during DB init.
- Create: `src-tauri/src/services/watchlist.rs`
  Owns watchlist persistence, Syosetu validation, refresh comparison, and viewed-episode writes.
- Modify: `src-tauri/src/services/mod.rs`
  Exports the watchlist service module.
- Create: `src-tauri/src/commands/watchlist.rs`
  Thin IPC handlers for load/add/refresh/mark-viewed.
- Modify: `src-tauri/src/commands/mod.rs`
  Exports watchlist commands.
- Modify: `src-tauri/src/lib.rs`
  Registers watchlist commands in the invoke handler.
- Modify: `src-tauri/src/models/novel.rs`
  Adds serde models for watchlist list items and episode rows.
- Test: `src-tauri/src/services/watchlist.rs`
  In-file unit tests with in-memory sqlite.

### Frontend

- Modify: `src/types/index.ts`
  Adds watchlist DTOs and tab badge state types.
- Modify: `src/stores/seriesStore.ts`
  Replaces batch-only state with watchlist list/detail/refresh state while keeping existing batch progress state intact.
- Create: `src/stores/seriesStore.test.ts`
  Covers watchlist store updates.
- Create: `src/hooks/useWatchlist.ts`
  Owns Tauri command calls and startup/manual refresh orchestration.
- Create: `src/hooks/useWatchlist.test.ts`
  Covers command mapping and startup refresh behavior.
- Modify: `src/hooks/useTranslation.ts`
  Marks the opened chapter as viewed after a chapter loads successfully.
- Modify: `src/components/layout/Header.tsx`
  Renames the tab label to `관심작품` and adds a badge count.
- Modify: `src/components/series/SeriesManager.tsx`
  Replaces the current batch-first view with watchlist list/detail UI.
- Create: `src/components/series/SeriesManager.test.tsx`
  Covers empty state, refresh state, and new-episode rendering.
- Modify: `src/App.tsx`
  Boots watchlist loading/startup refresh on app mount.

## Task 1: Add Watchlist Persistence and Comparison Logic

**Files:**
- Create: `src-tauri/src/db/migrations/005_watchlist.sql`
- Modify: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/services/watchlist.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/models/novel.rs`
- Test: `src-tauri/src/services/watchlist.rs`

- [ ] **Step 1: Write the failing Rust service tests**

```rust
#[tokio::test]
async fn add_watchlist_item_marks_existing_episodes_as_not_new() {
    let pool = setup_test_pool().await;
    seed_watchlist_schema(&pool).await;

    let series = SeriesInfo {
        site: "syosetu".into(),
        novel_id: "n3645ly".into(),
        title: "작품".into(),
        author: Some("작가".into()),
        total_chapters: 2,
        chapters: vec![
            ChapterInfo { number: 1, url: "https://ncode.syosetu.com/n3645ly/1/".into(), title: Some("1화".into()), status: "pending".into() },
            ChapterInfo { number: 2, url: "https://ncode.syosetu.com/n3645ly/2/".into(), title: Some("2화".into()), status: "pending".into() },
        ],
    };

    add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
        .await
        .expect("add watchlist item");

    let episodes = list_watchlist_episode_rows(&pool, "n3645ly").await.expect("episode rows");
    assert!(episodes.iter().all(|episode| !episode.is_new));
}

#[tokio::test]
async fn refresh_watchlist_item_marks_only_newly_added_episodes() {
    let pool = setup_test_pool().await;
    seed_watchlist_schema(&pool).await;

    seed_watchlist_item(&pool, "n3645ly").await;
    seed_watchlist_episode(&pool, "n3645ly", 1, false).await;
    seed_watchlist_episode(&pool, "n3645ly", 2, false).await;

    let series = SeriesInfo {
        site: "syosetu".into(),
        novel_id: "n3645ly".into(),
        title: "작품".into(),
        author: Some("작가".into()),
        total_chapters: 3,
        chapters: vec![
            ChapterInfo { number: 1, url: "https://ncode.syosetu.com/n3645ly/1/".into(), title: Some("1화".into()), status: "pending".into() },
            ChapterInfo { number: 2, url: "https://ncode.syosetu.com/n3645ly/2/".into(), title: Some("2화".into()), status: "pending".into() },
            ChapterInfo { number: 3, url: "https://ncode.syosetu.com/n3645ly/3/".into(), title: Some("3화".into()), status: "pending".into() },
        ],
    };

    let summary = refresh_watchlist_item_from_series(&pool, "n3645ly", &series)
        .await
        .expect("refresh watchlist item");

    assert_eq!(summary.new_episode_count, 1);
    let episodes = list_watchlist_episode_rows(&pool, "n3645ly").await.expect("episode rows");
    assert_eq!(episodes.iter().filter(|episode| episode.is_new).count(), 1);
    assert_eq!(episodes.last().and_then(|episode| Some(episode.chapter_number)), Some(3));
}
```

- [ ] **Step 2: Run the backend test target and verify RED**

Run: `cd src-tauri && cargo test -p app_lib watchlist -- --nocapture`

Expected: FAIL because the watchlist service, migration, and helper types do not exist yet.

- [ ] **Step 3: Add the migration and Rust models**

```sql
CREATE TABLE IF NOT EXISTS watchlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  work_url TEXT NOT NULL,
  novel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  last_known_chapter INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  last_check_status TEXT NOT NULL DEFAULT 'idle',
  last_check_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site, novel_id)
);

CREATE TABLE IF NOT EXISTS watchlist_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  chapter_url TEXT NOT NULL,
  title TEXT,
  is_new INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(novel_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS viewed_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(novel_id, chapter_number)
);
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistItem {
    pub site: String,
    pub work_url: String,
    pub novel_id: String,
    pub title: String,
    pub author: Option<String>,
    pub last_known_chapter: u32,
    pub last_checked_at: Option<String>,
    pub last_check_status: String,
    pub last_check_error: Option<String>,
    pub new_episode_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchlistEpisode {
    pub chapter_number: u32,
    pub chapter_url: String,
    pub title: Option<String>,
    pub is_new: bool,
    pub is_viewed: bool,
}
```

- [ ] **Step 4: Implement the minimal watchlist service**

```rust
pub async fn add_watchlist_item_from_series(
    pool: &Pool<Sqlite>,
    work_url: &str,
    series: &SeriesInfo,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO watchlist_items (site, work_url, novel_id, title, author, last_known_chapter, last_checked_at, last_check_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ok', CURRENT_TIMESTAMP)
         ON CONFLICT(site, novel_id) DO UPDATE SET
           work_url = excluded.work_url,
           title = excluded.title,
           author = excluded.author,
           last_known_chapter = excluded.last_known_chapter,
           last_checked_at = CURRENT_TIMESTAMP,
           last_check_status = 'ok',
           last_check_error = NULL,
           updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&series.site)
    .bind(work_url)
    .bind(&series.novel_id)
    .bind(&series.title)
    .bind(series.author.as_deref())
    .bind(series.total_chapters as i64)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for chapter in &series.chapters {
        sqlx::query(
            "INSERT INTO watchlist_episodes (novel_id, chapter_number, chapter_url, title, is_new, updated_at)
             VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(novel_id, chapter_number) DO UPDATE SET
               chapter_url = excluded.chapter_url,
               title = excluded.title,
               is_new = 0,
               updated_at = CURRENT_TIMESTAMP"
        )
        .bind(&series.novel_id)
        .bind(chapter.number as i64)
        .bind(&chapter.url)
        .bind(chapter.title.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
```

- [ ] **Step 5: Run the targeted backend tests and verify GREEN**

Run: `cd src-tauri && cargo test -p app_lib watchlist -- --nocapture`

Expected: PASS for the new watchlist service tests.

- [ ] **Step 6: Commit the backend persistence slice**

```bash
git add src-tauri/src/db/migrations/005_watchlist.sql src-tauri/src/db/mod.rs src-tauri/src/models/novel.rs src-tauri/src/services/mod.rs src-tauri/src/services/watchlist.rs
git commit -m "feat: add watchlist persistence primitives"
```

## Task 2: Add Tauri Watchlist Commands and Refresh Entry Points

**Files:**
- Create: `src-tauri/src/commands/watchlist.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/services/watchlist.rs`
- Test: `src-tauri/src/services/watchlist.rs`

- [ ] **Step 1: Write failing command-level tests around refresh and viewed state**

```rust
#[tokio::test]
async fn list_watchlist_items_includes_new_episode_count() {
    let pool = setup_test_pool().await;
    seed_watchlist_schema(&pool).await;
    seed_watchlist_item(&pool, "n3645ly").await;
    seed_watchlist_episode(&pool, "n3645ly", 1, false).await;
    seed_watchlist_episode(&pool, "n3645ly", 2, true).await;

    let items = list_watchlist_items_with_pool(&pool).await.expect("watchlist items");

    assert_eq!(items.len(), 1);
    assert_eq!(items[0].new_episode_count, 1);
}

#[tokio::test]
async fn mark_episode_viewed_clears_new_flag_for_that_episode() {
    let pool = setup_test_pool().await;
    seed_watchlist_schema(&pool).await;
    seed_watchlist_item(&pool, "n3645ly").await;
    seed_watchlist_episode(&pool, "n3645ly", 3, true).await;

    mark_episode_viewed_with_pool(&pool, "n3645ly", 3).await.expect("mark viewed");

    let episodes = list_watchlist_episode_rows(&pool, "n3645ly").await.expect("episode rows");
    let third = episodes.iter().find(|episode| episode.chapter_number == 3).expect("chapter 3");
    assert!(!third.is_new);
    assert!(third.is_viewed);
}
```

- [ ] **Step 2: Run the backend test target and verify RED**

Run: `cd src-tauri && cargo test -p app_lib watchlist -- --nocapture`

Expected: FAIL because list, refresh, and mark-viewed helpers are incomplete.

- [ ] **Step 3: Implement thin commands and service entry points**

```rust
#[tauri::command]
pub async fn add_watchlist_item(url: String) -> Result<WatchlistItem, String> {
    crate::services::watchlist::add_watchlist_item(&url).await
}

#[tauri::command]
pub async fn list_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    crate::services::watchlist::list_watchlist_items().await
}

#[tauri::command]
pub async fn refresh_watchlist() -> Result<Vec<WatchlistItem>, String> {
    crate::services::watchlist::refresh_watchlist_items().await
}

#[tauri::command]
pub async fn get_watchlist_episodes(novel_id: String) -> Result<Vec<WatchlistEpisode>, String> {
    crate::services::watchlist::get_watchlist_episodes(&novel_id).await
}

#[tauri::command]
pub async fn mark_episode_viewed(novel_id: String, chapter_number: u32) -> Result<(), String> {
    crate::services::watchlist::mark_episode_viewed(&novel_id, chapter_number).await
}
```

```rust
pub async fn refresh_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    let pool = get_pool()?;
    let rows = sqlx::query("SELECT work_url FROM watchlist_items ORDER BY updated_at DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    for row in rows {
        let work_url: String = row.get("work_url");
        if let Err(error) = refresh_watchlist_item(&work_url).await {
            log::warn!("watchlist refresh failed for {}: {}", work_url, error);
        }
    }

    list_watchlist_items().await
}
```

- [ ] **Step 4: Run the targeted backend tests and verify GREEN**

Run: `cd src-tauri && cargo test -p app_lib watchlist -- --nocapture`

Expected: PASS for list/new-count/viewed-state tests.

- [ ] **Step 5: Commit the command slice**

```bash
git add src-tauri/src/commands/watchlist.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/src/services/watchlist.rs
git commit -m "feat: expose watchlist tauri commands"
```

## Task 3: Add Frontend Watchlist Types, Store, and Hook

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/seriesStore.ts`
- Create: `src/stores/seriesStore.test.ts`
- Create: `src/hooks/useWatchlist.ts`
- Create: `src/hooks/useWatchlist.test.ts`

- [ ] **Step 1: Write the failing frontend store and hook tests**

```ts
it('tracks watchlist badge count from items with new episodes', () => {
  useSeriesStore.setState({
    watchlistItems: [],
    selectedWatchlistNovelId: null,
    watchlistEpisodes: [],
    isRefreshingWatchlist: false,
    watchlistLoaded: false,
  });

  useSeriesStore.getState().setWatchlistItems([
    { novelId: 'n1', title: '첫 작품', site: 'syosetu', workUrl: 'https://ncode.syosetu.com/n1/', author: null, lastKnownChapter: 2, lastCheckedAt: null, lastCheckStatus: 'ok', lastCheckError: null, newEpisodeCount: 0 },
    { novelId: 'n2', title: '둘째 작품', site: 'syosetu', workUrl: 'https://ncode.syosetu.com/n2/', author: null, lastKnownChapter: 3, lastCheckedAt: null, lastCheckStatus: 'ok', lastCheckError: null, newEpisodeCount: 2 },
  ]);

  expect(useSeriesStore.getState().watchlistBadgeCount).toBe(1);
});

it('loads items on startup and refreshes them in background', async () => {
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'list_watchlist_items') {
      return [{ novelId: 'n3645ly', title: '작품', site: 'syosetu', workUrl: 'https://ncode.syosetu.com/n3645ly/', author: null, lastKnownChapter: 2, lastCheckedAt: null, lastCheckStatus: 'ok', lastCheckError: null, newEpisodeCount: 0 }];
    }
    if (command === 'refresh_watchlist') {
      return [{ novelId: 'n3645ly', title: '작품', site: 'syosetu', workUrl: 'https://ncode.syosetu.com/n3645ly/', author: null, lastKnownChapter: 3, lastCheckedAt: '2026-04-08T10:00:00Z', lastCheckStatus: 'ok', lastCheckError: null, newEpisodeCount: 1 }];
    }
    return [];
  });

  const { result } = renderHook(() => useWatchlist());
  await act(async () => {
    await result.current.loadWatchlistOnStartup();
  });

  expect(invokeMock).toHaveBeenCalledWith('list_watchlist_items');
  expect(invokeMock).toHaveBeenCalledWith('refresh_watchlist');
  expect(useSeriesStore.getState().watchlistBadgeCount).toBe(1);
});
```

- [ ] **Step 2: Run the frontend test target and verify RED**

Run: `pnpm test -- src/stores/seriesStore.test.ts src/hooks/useWatchlist.test.ts`

Expected: FAIL because the new store fields and hook do not exist yet.

- [ ] **Step 3: Add the watchlist DTOs and Zustand state**

```ts
export interface WatchlistItem {
  site: string;
  workUrl: string;
  novelId: string;
  title: string;
  author: string | null;
  lastKnownChapter: number;
  lastCheckedAt: string | null;
  lastCheckStatus: string;
  lastCheckError: string | null;
  newEpisodeCount: number;
}

export interface WatchlistEpisode {
  chapterNumber: number;
  chapterUrl: string;
  title: string | null;
  isNew: boolean;
  isViewed: boolean;
}
```

```ts
interface SeriesState {
  watchlistItems: WatchlistItem[];
  setWatchlistItems: (items: WatchlistItem[]) => void;
  selectedWatchlistNovelId: string | null;
  setSelectedWatchlistNovelId: (novelId: string | null) => void;
  watchlistEpisodes: WatchlistEpisode[];
  setWatchlistEpisodes: (episodes: WatchlistEpisode[]) => void;
  isRefreshingWatchlist: boolean;
  setIsRefreshingWatchlist: (value: boolean) => void;
  watchlistLoaded: boolean;
  setWatchlistLoaded: (value: boolean) => void;
  watchlistBadgeCount: number;
}
```

- [ ] **Step 4: Implement `useWatchlist` with minimal command wrappers**

```ts
export const useWatchlist = () => {
  const setWatchlistItems = useSeriesStore((s) => s.setWatchlistItems);
  const setWatchlistEpisodes = useSeriesStore((s) => s.setWatchlistEpisodes);
  const setIsRefreshingWatchlist = useSeriesStore((s) => s.setIsRefreshingWatchlist);
  const setWatchlistLoaded = useSeriesStore((s) => s.setWatchlistLoaded);

  const loadWatchlistOnStartup = useCallback(async () => {
    const items = await invoke<WatchlistItem[]>('list_watchlist_items');
    setWatchlistItems(items);
    setWatchlistLoaded(true);

    setIsRefreshingWatchlist(true);
    try {
      const refreshed = await invoke<WatchlistItem[]>('refresh_watchlist');
      setWatchlistItems(refreshed);
    } finally {
      setIsRefreshingWatchlist(false);
    }
  }, [setIsRefreshingWatchlist, setWatchlistItems, setWatchlistLoaded]);

  return { loadWatchlistOnStartup };
};
```

- [ ] **Step 5: Run the targeted frontend tests and verify GREEN**

Run: `pnpm test -- src/stores/seriesStore.test.ts src/hooks/useWatchlist.test.ts`

Expected: PASS for the new store and startup-refresh tests.

- [ ] **Step 6: Commit the frontend state slice**

```bash
git add src/types/index.ts src/stores/seriesStore.ts src/stores/seriesStore.test.ts src/hooks/useWatchlist.ts src/hooks/useWatchlist.test.ts
git commit -m "feat: add watchlist frontend state"
```

## Task 4: Replace the Series Tab UI with the Watchlist Screen

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/series/SeriesManager.tsx`
- Create: `src/components/series/SeriesManager.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
it('renders the 관심작품 empty state when nothing is tracked', async () => {
  useSeriesStore.setState({
    watchlistItems: [],
    watchlistEpisodes: [],
    selectedWatchlistNovelId: null,
    isRefreshingWatchlist: false,
    watchlistLoaded: true,
  });

  render(<SeriesManager />);

  expect(screen.getByText('관심작품이 없습니다')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
});

it('shows a header badge for tracked works with new episodes', () => {
  useSeriesStore.setState({
    watchlistItems: [
      { novelId: 'n3645ly', title: '작품', site: 'syosetu', workUrl: 'https://ncode.syosetu.com/n3645ly/', author: null, lastKnownChapter: 3, lastCheckedAt: null, lastCheckStatus: 'ok', lastCheckError: null, newEpisodeCount: 2 },
    ],
    watchlistBadgeCount: 1,
  });

  render(<Header />);

  expect(screen.getByRole('tab', { name: /관심작품/ })).toHaveTextContent('1');
});
```

- [ ] **Step 2: Run the frontend component tests and verify RED**

Run: `pnpm test -- src/components/series/SeriesManager.test.tsx src/stores/uiStore.test.ts`

Expected: FAIL because the new empty state, refresh button, and badge do not exist yet.

- [ ] **Step 3: Implement the minimal watchlist screen**

```tsx
<div className="flex items-center justify-between gap-3">
  <div>
    <h2 className={isDark ? 'text-white text-xl font-semibold' : 'text-slate-900 text-xl font-semibold'}>
      관심작품
    </h2>
    <p className={isDark ? 'text-slate-400 text-sm' : 'text-slate-500 text-sm'}>
      등록한 작품의 새 화를 확인합니다.
    </p>
  </div>
  <Button type="button" variant="secondary" onClick={refreshWatchlist} isLoading={isRefreshingWatchlist}>
    새로고침
  </Button>
</div>
```

```tsx
{watchlistItems.length === 0 ? (
  <div className={`rounded-xl border p-8 text-center ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
    <h3 className={isDark ? 'text-white text-lg font-semibold' : 'text-slate-900 text-lg font-semibold'}>
      관심작품이 없습니다
    </h3>
    <p className={isDark ? 'text-slate-400 mt-2' : 'text-slate-500 mt-2'}>
      Syosetu 작품 URL을 등록해서 새 화를 추적하세요.
    </p>
  </div>
) : null}
```

- [ ] **Step 4: Run the targeted component tests and verify GREEN**

Run: `pnpm test -- src/components/series/SeriesManager.test.tsx src/stores/uiStore.test.ts`

Expected: PASS for empty state, refresh button, and header badge rendering.

- [ ] **Step 5: Commit the watchlist UI slice**

```bash
git add src/components/layout/Header.tsx src/components/series/SeriesManager.tsx src/components/series/SeriesManager.test.tsx
git commit -m "feat: add watchlist management screen"
```

## Task 5: Wire Startup Refresh and Mark Opened Episodes as Viewed

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useTranslation.ts`
- Modify: `src/hooks/useTranslation.test.ts`
- Modify: `src/hooks/useWatchlist.ts`

- [ ] **Step 1: Write the failing integration-level tests**

```ts
it('marks the opened chapter as viewed after parseChapter succeeds', async () => {
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'parse_chapter') {
      return {
        site: 'syosetu',
        novel_id: 'n3645ly',
        chapter_number: 3,
        title: '제3화',
        subtitle: '',
        paragraphs: ['문단'],
        prev_url: null,
        next_url: null,
        novel_title: '작품',
      };
    }
    return undefined;
  });

  const { result } = renderHook(() => useTranslation());
  await act(async () => {
    await result.current.parseChapter('https://ncode.syosetu.com/n3645ly/3/');
  });

  expect(invokeMock).toHaveBeenCalledWith('mark_episode_viewed', {
    novelId: 'n3645ly',
    chapterNumber: 3,
  });
});
```

```tsx
useEffect(() => {
  void loadWatchlistOnStartup();
}, [loadWatchlistOnStartup]);
```

- [ ] **Step 2: Run the hook test target and verify RED**

Run: `pnpm test -- src/hooks/useTranslation.test.ts src/hooks/useWatchlist.test.ts`

Expected: FAIL because opening a chapter does not yet notify the backend and app startup does not load the watchlist.

- [ ] **Step 3: Implement the minimal startup and viewed-state wiring**

```ts
const parseChapter = useCallback(async (url: string) => {
  const content = await invoke<ParseChapterResult>('parse_chapter', { url });

  setChapterContent({
    ...content,
    source_url: url,
    paragraphs: content.paragraphs.map((original, index) => ({
      id: `p-${index + 1}`,
      original,
      translated: '',
    })),
  });

  if (content.chapter_number > 0) {
    await invoke('mark_episode_viewed', {
      novelId: content.novel_id,
      chapterNumber: content.chapter_number,
    });
  }
}, [setChapterContent]);
```

- [ ] **Step 4: Run the targeted hook tests and verify GREEN**

Run: `pnpm test -- src/hooks/useTranslation.test.ts src/hooks/useWatchlist.test.ts`

Expected: PASS for startup loading and mark-viewed behavior.

- [ ] **Step 5: Run repository verification for the feature**

Run:

```bash
pnpm run lint
pnpm run build
pnpm test
cd src-tauri && cargo test -p app_lib
cd src-tauri && cargo clippy -- -D warnings
```

Expected: PASS. If ignored parser tests are untouched, no need to run `cargo test -p app_lib -- --ignored`.

- [ ] **Step 6: Commit the final wiring**

```bash
git add src/App.tsx src/hooks/useTranslation.ts src/hooks/useTranslation.test.ts src/hooks/useWatchlist.ts
git commit -m "feat: wire watchlist startup refresh and viewed state"
```

## Self-Review

- Spec coverage check:
  - `관심작품` naming and badge are covered in Task 4.
  - startup background refresh and manual refresh are covered in Tasks 2, 3, and 4.
  - separate viewed-episode tracking is covered in Tasks 1, 2, and 5.
  - Syosetu-only scope is enforced in Task 2 by reusing parser-backed validation.
- Placeholder scan:
  - Removed vague placeholders and named exact files, commands, and expected behavior for every task.
- Type consistency:
  - Backend uses `WatchlistItem` / `WatchlistEpisode`, frontend mirrors them as camelCase DTOs, and viewed-state command parameters stay `novelId` + `chapterNumber`.
