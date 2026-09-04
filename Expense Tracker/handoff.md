# Handoff — Stock Market Predictor and Tutor

Synthesized session summary for picking this project up cold. Written for whoever (human or AI) resumes work next — read this before touching code.

Repo: `Nath-Goa/Shipaton` · App slug: `mock-stock-trainer` · All app code lives in the **`Expense Tracker/`** subfolder of the repo root.

---

## 1. What this project is

A mock/paper stock-trading app bundled with a personal expense tracker, built as one combined "financial life" app. Everything is simulated — no real money, no real brokerage, no real bank connection. It has:

- A **mock stock market** (deterministic random-walk engine, optionally backed by real live prices)
- **Paper trading**: buy/sell, dividends, limit orders, recurring auto-invest (DCA), multiple portfolios, benchmark comparison, diversification scoring
- An **expense tracker**: manual/receipt-photo entry, budgets, recurring expenses, CSV export, savings goals (manual + recurring + round-up), bill reminders
- A **Learn** tab: quizzes, flashcards, narrative "trading scenario" challenges, spaced repetition, streaks/badges
- An AI **Assistant** ("the analyst") for chat, plus AI features scattered throughout (receipt auto-fill, spending insights, weekly recap, pattern detection, quiz/flashcard/scenario generation)
- A **subscription paywall** (Free / Pro / Max) via RevenueCat, gating specific features
- Local **push notifications**, **biometric app lock**, a simulated **leaderboard**, a **shareable results card** (image export)

## 2. How this project is being built — operational conventions

**The user works entirely from an Android phone — no laptop, no terminal access of their own.** Every commit, push, and build has been driven by Claude directly in this session. These rules have been established and repeated throughout and must keep holding:

- **Always commit and push directly to `main`.** Never a feature branch, never a PR — the user cannot review a PR from their phone in any practical way for this project.
- **Never trigger a new EAS Build unless the user explicitly asks** ("trigger build" / "trigger the build"). Code changes get pushed to `main` on their own; the build is a separate, explicit, costed action.
- **Real secrets only in the local `.env`** (gitignored) or the **EAS dashboard's environment variables** — never committed to git. `.env.example` documents every variable and what it unlocks (see §8).
- Standard loop for every change: implement → `npx tsc --noEmit` (must be clean) → self-review the diff for correctness bugs → commit with a descriptive message → push to `main`.
- The user gives feedback in plain, sometimes vague terms from live device testing ("the home button doesn't work", "for some reason when I open a tab..."). Treat these as real bug reports and root-cause them in the code — they have consistently pointed at genuine bugs, not user error.

**`AGENTS.md`** (auto-loaded via `CLAUDE.md`) says: *"Expo HAS CHANGED — read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code."* Expo SDK is currently **57.0.19**. Don't assume older-SDK APIs still apply.

## 3. Tech stack

- **Expo SDK 57**, React Native, TypeScript, **expo-router** (file-based routing, typed routes)
- **Zustand** for all state, with `persist` + `createJSONStorage(() => AsyncStorage)` for anything that should survive app restarts
- **react-native-reanimated** for all animation (spring configs centralized in `constants/animations.ts`), plus a small sound/haptic feedback system (`triggerFeedback(category)`)
- **RevenueCat** (`react-native-purchases` + `react-native-purchases-ui`) for subscriptions; falls back to a local dev-mode tier switcher when no API key is configured
- AI: direct HTTP calls to **Claude, OpenAI, Gemini, and OpenRouter** (no SDK abstraction layer beyond `services/ai/client.ts`)
- **Sentry** (`@sentry/react-native`) for crash reporting — no-op without a DSN
- **expo-notifications**, **expo-local-authentication** (biometric lock), **expo-store-review**, **expo-sharing** + **react-native-view-shot** (share image), **@react-native-community/datetimepicker**

No automated test suite exists (no Jest/Detox/etc.). Verification is `tsc --noEmit` + manual/self code review only — see §9 "Known gaps."

## 4. Repository structure (inside `Expense Tracker/`)

```
app/
  _layout.tsx                 Root layout: onboarding gate, app lock, startup effects
                               (dividends/auto-invest/goal-contributions/bill-reminders
                               processing, RevenueCat sync, review-prompt trigger)
  (tabs)/_layout.tsx           Custom animated bottom tab bar (6 tabs)
  (tabs)/index.tsx             Home
  (tabs)/learn/                Learn tab: index, quiz, flashcards, narrative
  (tabs)/markets/              Markets tab: index, [symbol], practice, backtest
  (tabs)/portfolio/            Portfolio tab: index, manage, leaderboard, networth,
                                trade/[symbol]
  (tabs)/expenses/             Expenses tab: index, add, [id], budgets, goals
  (tabs)/assistant/            Assistant (AI chat) tab
  settings/                    index, upgrade (paywall), achievements

store/            15 Zustand stores — see §5.2
services/         ai/, marketData/, purchases/, notifications/, export/, receipts/,
                   leaderboard/, market/ (signals + backtest), sound/, monitoring/
components/       ui/ (Button, IconButton, Chip, Card, Screen, TopBar, ProgressBar,
                   SegmentedControl, StatTile, EmptyState, ToastHost, UpgradeBanner, …),
                   charts/, expenses/, portfolio/, markets/, chat/, reviews/,
                   security/, settings/, onboarding/, games/
constants/        theme, animations, subscription (tiers/pricing/features),
                   categories, tickers, badges, quizTopics, quizBank, flashcardBank
hooks/            useTheme, useQuotes, useAiQuota, useHasApiKey, useUpgradeToTier
utils/            date, money, id, confirm, portfolioMath
types/            ai, chat, expense, narrative, quiz, stock
```

## 5. Architecture

### 5.1 Navigation

`expo-router` with a `(tabs)` group of 6 tabs: **Home, Learn, Markets, Portfolio, Expenses, Assistant**. Each tab is its own `Stack` (so pushed sub-screens — e.g. `expenses/add`, `portfolio/manage`, `markets/[symbol]` — unmount/remount normally on push/pop). `Settings` is a sibling stack reached from Home's top-right gear icon.

The tab bar itself (`app/(tabs)/_layout.tsx`) is **custom**: it keeps Expo Router's stock `<Tabs>` container (safe areas, sizing) but swaps in an animated icon (`tabBarIcon`) and an animated button (`tabBarButton`) with press-scale + haptic + a fading "active pill" background.

**Important, non-obvious fact about this navigator:** `<Tabs>` (React Navigation's bottom-tabs under the hood) keeps every tab's *root* screen mounted in the background after its first visit, so switching tabs never re-triggers a mount-based effect or a Reanimated `entering=` animation. We deliberately do **not** fight this (see §7, "entrance animations only fire once"). Pushed screens *within* a tab's own stack are unaffected — those genuinely unmount/remount on pop.

### 5.2 State (Zustand stores, all in `store/`)

All persisted stores use `AsyncStorage` via `persist` + `createJSONStorage`. Cross-store calls (e.g. a savings-goal contribution awarding a badge) go through `useXStore.getState()` — a well-established, deliberate pattern in this codebase, not an accident.

| Store | Purpose |
|---|---|
| `useExpenseStore` | Expenses list, recurring-expense series (cursor-based catch-up), round-up-savings trigger on `addExpense` |
| `useBudgetStore` | Overall + per-category monthly budgets |
| `useSavingsGoalStore` | Savings goals: create/contribute/delete, recurring auto-contributions, round-up target selection |
| `usePortfolioStore` | Multiple portfolios (Max tier), trades, dividends, limit orders, auto-invest plans, watchlist |
| `useMarketStore` | Just an `epoch` counter — bumping it re-seeds the entire mock market |
| `useStockViewStore` | Free-tier "5 stock lookups/day" gate + simulated ad-slot counter |
| `useStreakStore` | Daily activity streak, badge list, pattern-detection/analyst-question counters (feeds Learn streak + badges) |
| `useQuizStore` | Per-topic quiz progress, spaced-repetition due dates, mastery |
| `useFlashcardStore` | Flashcard deck progress/history per topic |
| `useWeeklyRecapStore` | Caches the last AI-generated weekly recap (Home tab) until manually refreshed |
| `useChatStore` | Assistant chat threads (general + per-symbol) |
| `useAiUsageStore` | Shared daily AI-action counter (only meaningful without a personal API key) |
| `useSettingsStore` | Theme, accent color, tier (RevenueCat-synced), AI provider/keys, notifications, biometric lock, broken-key tracking |
| `useReviewStore` | Whether the in-app review prompt has fired |
| `useToastStore` | Global single-slot toast (not persisted) |

### 5.3 AI subsystem (`services/ai/`)

**`client.ts` is the single dispatch point for every AI feature in the app** (chat, quizzes, daily challenges, pattern detection, receipt auto-fill, spending insight, weekly recap). Never call a provider file directly from a screen. It handles:

- Picking the user's chosen provider (Claude/OpenAI/Gemini) + their own key if set, else falling back to the shared key(s)
- `sendStructuredPrompt<T>(systemPrompt, userPrompt)` — the workhorse for every "give me back JSON" feature; wraps `sendChatMessage` + `parseJsonResponse`
- Quota enforcement against `AI_FEATURE_DAILY_LIMIT[tier]` (only when running on a shared key — a working personal key is unlimited)
- Racing Gemini against a shared OpenRouter free model when both shared keys are configured (`raceEligible: true` requests)
- Tracking broken personal keys (`useSettingsStore.brokenKeyProviders`) so the UI can nudge without silently failing forever

Prompts live in `services/ai/prompts.ts` (one `buildXPrompt()` per feature); results/types live in `services/ai/insights.ts` and `services/ai/learn.ts`. Error classification → user-facing copy goes through `services/ai/errorMessage.ts` (`describeAiError`).

### 5.4 Market data (`services/marketData/`)

`marketData.ts` is the dispatch point: uses `liveMarketData.ts` (Twelve Data) if `EXPO_PUBLIC_TWELVEDATA_API_KEY` is set, else `mockMarketData.ts` (fully local, deterministic, seeded random-walk, 400 days of history per symbol). Live fetches are TTL-gated (6h bars / 60s quotes) and fall back to cached/mock data on any failure — the app never hard-fails on market data.

**Known asymmetry**: `computePortfolioVsBenchmark`'s date "spine" is anchored on `TICKERS[0]` (fine — that function always needs the full ticker universe anyway). `computeNetWorthHistory`'s spine is anchored on whichever *traded* symbol has the longest cached history (fixed mid-session — see §7). Don't blindly copy one function's spine logic into the other; they have different correctness requirements.

### 5.5 Subscriptions (`services/purchases/`, `constants/subscription.ts`)

Three tiers: **Free / Pro / Max** (`Tier` type). `TIER_FEATURES` is the single source of truth for what each tier unlocks (forecast bands, live sentiment, receipt auto-fill, push alerts, pattern detection, backtesting, multiple portfolios, limit orders, stock-lookup daily limit). Demo pricing: Pro $5/mo · $49.99/yr · $129.99 lifetime; Max $15/mo · $139.99/yr · $349.99 lifetime (real prices come from the store once RevenueCat is configured).

Without a RevenueCat API key configured, the paywall (`app/settings/upgrade.tsx`) shows a **dev-only tier switcher** instead of real purchases — this is intentional demo-mode behavior, not a bug.

### 5.6 Notifications (`services/notifications/notifications.ts`)

Local-only (no backend, no real push). Three kinds, each idempotent/re-schedulable:
1. Daily 8pm check-in reminder (fixed identifier, user-toggleable)
2. Same-day "streak at risk" nudge at 9pm, refreshed on every app open, cancelled once today's activity is logged
3. Per-recurring-expense-series "due tomorrow" 9am nudge (dynamic identifiers, one per series, refreshed whenever `computeUpcomingRecurring` output changes)

All gated behind `useSettingsStore.notificationsEnabled` **and** `TIER_FEATURES[tier].pushAlerts` (Pro/Max only).

### 5.7 Gamification

`useStreakStore.awardBadge(id)` is a generic, idempotent one-off badge award (returns `[id]` first time, `[]` after) used by first-trade, diversified-portfolio, budget-met, and goal-reached badges, alongside the streak-milestone/pattern-master/analyst badges. `constants/badges.ts` (`BADGE_INFO`) is the single registry of every badge — new badges just need an entry there plus a call to `awardBadge`. `app/settings/achievements.tsx` renders every `BADGE_INFO` entry (earned vs. locked) plus current streak.

## 6. Feature inventory by tab (current state)

- **Home**: net worth / P&L stat row, free-tier upsell banner, watchlist with direction calls, quick actions, **AI weekly recap** card (spending + portfolio + goals, last 7 days, cached until refreshed)
- **Learn**: streak card, badge row, next-topic card (spaced repetition), flashcards entry, daily-challenge (narrative scenario) entry, full topic list with per-topic status. Quiz/flashcard/narrative content is bank-first (static `quizBank.ts`/`flashcardBank.ts`) with an always-available AI-generate fallback/supplement, plus history modals.
- **Markets**: searchable ticker list with star-to-watchlist, direction-call badges, practice-trade mode, regenerate-market / refresh-prices action, backtest screen (Max), per-symbol detail with forecast band / sentiment (Pro+ gated)
- **Portfolio**: multi-portfolio support (Max), stat row incl. tappable net-worth tile → net worth history screen, portfolio-vs-benchmark chart, holdings list, diversification donut + warning, auto-invest plans list, dividend income list, recent trades, share-as-image results card, leaderboard
- **Expenses**: filterable/searchable list with day grouping, category donut breakdown, AI spending insight, budgets screen (overall + per-category, with shared `ProgressBar`), **savings goals** screen (create/contribute/delete, recurring auto-contribution, round-up-savings source selector), CSV export
- **Assistant**: general + per-symbol chat threads, history modal, shared-key/quota/broken-key messaging, Flappy-Bird mini-loader while waiting on AI
- **Settings**: theme/accent, AI provider + BYOK key entry, notifications toggle, biometric lock toggle, achievements, plan management (paywall + Customer Center), reset-all-data

## 7. Critical technical constraints — bugs already hit, do not reintroduce

These are hard-won and each caused a real, user-visible failure this session. Read before touching animation, store selectors, or the tab bar.

1. **Zustand selector referential stability.** A selector passed to `useStore(selector)` (built on React's `useSyncExternalStore`) **must** return a value that's `Object.is`-stable across two calls against an *unchanged* state snapshot. Returning a freshly-built array/object/Set/Map from inside the selector (`.map()`, `.filter()`, `.sort()`, `Array.from()`, `Object.values()`, `new Set()`, spread, an inline `{...}`/`[...]` literal) breaks that contract and can send React into an infinite re-render loop (**"Maximum update depth exceeded"** — this crashed the app on every open via `LimitOrderWatcher.tsx` earlier this session). Correct pattern: select the store's own raw/stable field, derive anything computed via `useMemo` in the component. A primitive return (number/string/boolean, e.g. `s.badges.length`) is always safe regardless.
2. **Reanimated `entering=` must never share a native view with touch handling.** A view that's still mid-entrance-animation can have unreliable touch hit-testing for its first tap or two. Six modal sheets + a flashcard flip-card had `AnimatedPressable` carrying *both* `entering={...}` *and* `onPress=...` on the same node — this made buttons need "a few tries" right after the sheet/card appeared. Fixed pattern: entrance animation on a plain, non-touchable `Animated.View`; touch handling on a plain `Pressable` nested inside it.
3. **Tab-root entrance animations only fire once per app session, by design.** A prior fix attempt made every tab's entrance animations replay on every tab-focus (via a remount key). This multiplied exposure to bug #2 across *every* interactive element on *every* tab switch and was **reverted**. Don't reintroduce animation-replay-on-focus without also solving #2 comprehensively for every affected element — the cosmetic win isn't worth the touch-reliability cost.
4. **`useCallback` deps must include every prop function actually called inside.** The custom tab bar's `onPress`/`onPressIn`/`onPressOut` handlers were memoized on `[focused]`/`[scale]` only, with `// eslint-disable-next-line react-hooks/exhaustive-deps` suppressing the warning — but each handler calls `props.onX?.(e)` inside. Since `focused` doesn't change while the user bounces between *other* tabs, the handler went stale and kept calling an outdated `props.onPress` from react-navigation, which is the most likely explanation for **"the Home button literally does not work"**. If you see a suppressed exhaustive-deps warning on a handler that forwards to a prop callback, that's a bug, not a style choice — fix the deps, don't suppress.
5. **Month-arithmetic overflow.** `Date.setMonth()` on a day-of-month that doesn't exist in the target month silently rolls into the *following* month (Jan 31 + 1 month → "Mar 3", not "Feb 28"). `utils/date.ts`'s `addMonthsStr` clamps to the target month's real last day — it's shared by every recurring-schedule feature (expenses, auto-invest, goal auto-contributions). Never reimplement month-add locally; always import `addMonthsStr`.
6. **Cursor-based recurring/catch-up processing.** Every "catch up N cycles since last time" feature (recurring expenses, dividends, limit orders, auto-invest, goal auto-contributions, bill reminders) uses a **persisted cursor field** (last-processed date), advanced in a guard-capped `while` loop — never recomputed from what's currently visible in an array. Recomputing from visible contents breaks the moment a user deletes/re-adds an item (double-processing or skipped processing).
7. **Historical-value date "spine" must come from the most-complete series**, not an arbitrary/first one — see §5.4.

## 8. Environment & secrets

Everything is optional and additive — the app is fully functional in demo mode with zero env vars set. See `.env.example` for full documentation of each; summary:

- `EXPO_PUBLIC_REVENUECAT_{IOS,ANDROID}_API_KEY` / `_API_KEY` (fallback) — real purchases; without these, dev tier-switcher instead
- `EXPO_PUBLIC_SHARED_GEMINI_API_KEY` — shared/fallback AI key so AI features work without BYOK
- `EXPO_PUBLIC_SHARED_OPENROUTER_API_KEY` — second shared key, raced against Gemini for text features (not receipt photos)
- `EXPO_PUBLIC_TWELVEDATA_API_KEY` — real live-ish market data instead of the mock engine
- `EXPO_PUBLIC_SENTRY_DSN` — crash reporting (source-map upload is currently disabled — no `SENTRY_AUTH_TOKEN`)

`eas.json` has `development`/`preview`/`production` build profiles. `app.json`: bundle ID `com.nathgoa.mockstocktrainer`, scheme `mockstocktrainer`.

## 9. This session's changes, chronological

1. Fixed the app-open crash (`LimitOrderWatcher` infinite-loop — §7.1)
2. Added recurring auto-invest (DCA) to the portfolio + a net worth history screen
3. Added savings goals (create/contribute/delete), extracting a shared `ProgressBar` component
4. Added recurring auto-contributions to savings goals, a goals summary on the net worth screen, and bill reminders for recurring expenses
5. Added round-up savings (spare change from logged expenses → a chosen goal), the achievements screen, and the AI weekly recap on Home
6. Full-codebase audit confirming none of the earlier bug classes (§7.1, §7.5, §7.7) had crept back in
7. Attempted to make tab entrance animations replay on refocus — **reverted** after it caused widespread button unreliability (§7.3)
8. Fixed the real causes of "buttons don't work"/"glitchy": the tab-bar stale-closure bug (§7.4) and the six modal-sheet + flashcard touch-hit-testing bugs (§7.2)
9. Triggered `EAS Build (Android)` twice (once early, once after the button fixes) — always on explicit request, per §2

Every step above: `tsc --noEmit` clean, self-reviewed, committed, and pushed straight to `main`.

## 10. Known gaps / things to be aware of

- **No automated tests.** Correctness relies on `tsc` + manual review. Anything genuinely load-bearing (recurring-cursor math, date arithmetic, selector purity) deserves extra scrutiny on every touch, precisely because nothing will catch a regression automatically.
- **No live device verification loop.** All work happens by reading/editing code and typechecking; actual on-device behavior is only confirmed when the user reports back after a build. Treat user reports of "X doesn't work" as authoritative bug signal, not user error — every one so far has pointed at a real bug.
- The backdrop `AnimatedPressable` (full-screen dismiss-on-tap layer) in the six modals was **left as-is** — it uses a simple opacity `FadeIn`, not a transform, and a missed early dismiss-tap is a much milder failure than a broken Submit button. If it's ever reported as flaky, apply the same split-animation-from-touch fix used for the sheets.
- `computePortfolioVsBenchmark` and `computeNetWorthHistory` have *different* correct date-spine logic (§5.4) — don't unify them without re-deriving why they differ.

## 11. Suggested next steps (not yet started)

Discussed but not built — offered to the user as options, none picked yet:

- **Debt/loan payoff tracker** — mirror of savings goals (balance going down instead of up), reusing the recurring-contribution and progress-bar machinery almost entirely. Lowest-effort of the four given how much infrastructure already exists.
- **Streak/activity calendar heatmap** — a GitHub-style day-by-day grid of app activity, giving the existing streak/badge system a visual history it currently lacks.
- **Custom expense categories** — user-defined categories (icon/color) beyond the fixed `constants/categories.ts` list + generic "Other" + free-text label.
- **Goal-reached milestones plotted on the net worth chart** — annotate `computeNetWorthHistory`'s chart with markers at each savings goal's `completedAt` date; both data sources already exist independently, just need combining in the net worth screen.

Beyond that: no open bugs, no half-finished features. The natural next move is either to build one of the above, or to ask the user what they want next.
