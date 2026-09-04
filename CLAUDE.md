# CLAUDE.md — Shipaton / Stock Market Predictor and Tutor

This file is permanent project memory, auto-loaded at the start of every session in this repo. It is the single source of truth for how this project works — read it before doing anything else.

**Keep it current.** When asked to "update CLAUDE.md" (or similar), edit this file in place to reflect the new state — don't create separate handoff/summary files elsewhere in the repo for this purpose. This file is the one that travels with every new chat.

App code lives in the **`Expense Tracker/`** subfolder of this repo, not the repo root — `cd` there for all `npm`/`expo`/`tsc` commands.

---

## 1. Project goals

Built for the **RevenueCat Shipaton** hackathon (team: Nathan Kumtakar, Arya Kakani). A combined "financial life" app: **mock/paper stock trading** + a **personal expense tracker**, wrapped in one app so a subscription (via RevenueCat) has enough real feature surface to gate meaningfully. Everything financial is simulated — no real brokerage, no real bank connection, no real money at risk. The pitch is educational: practice trading and budgeting with zero real-world downside, while learning the underlying concepts through the Learn tab.

## 2. Working conventions — read before doing anything

**The user works entirely from an Android phone — no laptop, no terminal of their own.** Claude drives the entire dev workflow directly. These rules are established and must keep holding across every session:

- **Always commit and push directly to `main`.** Never a feature branch, never a PR for routine work — there's no practical way for the user to review one from a phone.
- **Never trigger a new EAS Build unless explicitly asked** ("trigger build" / "trigger the build"). Pushing to `main` is routine; a build is a separate, explicit, costed action.
- **Real secrets only in the local `.env`** (gitignored) or the **EAS dashboard's environment variables** — never committed. `.env.example` documents every variable.
- Loop for every change: implement → `npx tsc --noEmit` clean → self-review the diff for correctness → commit with a real, descriptive message → push.
- **The user's bug reports are plain and sometimes vague, from live device testing** ("the home button doesn't work", "for some reason when I open a tab..."). Treat every one as a real bug and root-cause it in the code — every report so far has pointed at a genuine bug, never user error.
- Artifacts (design docs, handoffs, written summaries) go to Claude Artifacts when the user wants something to read/share, not into the repo — unless, as with this file, they explicitly ask for it to live in the codebase.

`AGENTS.md` (in `Expense Tracker/`) says: *"Expo HAS CHANGED — read the exact versioned docs at docs.expo.dev/versions/v57.0.0 before writing any code."* Expo SDK is **57.0.19** — don't assume older-SDK APIs still apply.

## 3. Tech stack

- **Expo SDK 57**, React Native, TypeScript, **expo-router** (file-based routing, typed routes)
- **Zustand** for all state, `persist` + `createJSONStorage(() => AsyncStorage)` for anything that survives restarts
- **react-native-reanimated** for animation (spring configs centralized in `constants/animations.ts`), plus a sound/haptic feedback helper (`triggerFeedback(category)`)
- **RevenueCat** (`react-native-purchases` + `react-native-purchases-ui`) for subscriptions — dev-mode tier switcher when no API key is configured
- AI: direct HTTP to **Claude, OpenAI, Gemini, and OpenRouter** — no SDK abstraction layer beyond `services/ai/client.ts`
- **Sentry** for crash reporting (no-op without a DSN), **expo-notifications**, **expo-local-authentication** (biometric lock), **expo-store-review**, **expo-sharing** + **react-native-view-shot** (share-as-image), **@react-native-community/datetimepicker**
- **No automated test suite.** Verification is `tsc --noEmit` + manual/self code review only. Be extra careful with anything load-bearing (recurring-cursor math, date arithmetic, store-selector purity) — nothing will catch a regression automatically.

## 4. Repository structure

```
Expense Tracker/                (app root — cd here for everything)
  app/
    _layout.tsx                 Root layout: onboarding gate, app lock, startup
                                 effects (dividends/auto-invest/goal-contributions/
                                 bill-reminders processing, RevenueCat sync, review prompt)
    (tabs)/_layout.tsx           Custom animated bottom tab bar (6 tabs)
    (tabs)/index.tsx             Home
    (tabs)/learn/                 Learn — index, quiz, flashcards, narrative
    (tabs)/markets/                Markets — index, [symbol], practice, backtest
    (tabs)/portfolio/               Portfolio — index, manage, leaderboard, networth, trade/[symbol]
    (tabs)/expenses/                 Expenses — index, add, [id], budgets, goals
    (tabs)/assistant/                 Assistant — AI chat
    settings/                         index, upgrade (paywall), achievements
  store/            15 Zustand stores — see §5.2
  services/         ai/, marketData/, purchases/, notifications/, export/,
                     receipts/, leaderboard/, market/, sound/, monitoring/
  components/       ui/, charts/, expenses/, portfolio/, markets/, chat/,
                     reviews/, security/, settings/, onboarding/, games/
  constants/        theme, animations, subscription, categories, tickers,
                     badges, quizTopics, quizBank, flashcardBank
  hooks/            useTheme, useQuotes, useAiQuota, useHasApiKey, useUpgradeToTier
  utils/            date, money, id, confirm, portfolioMath
  types/            ai, chat, expense, narrative, quiz, stock
```

## 5. Architecture

### 5.1 Navigation

`expo-router` with a `(tabs)` group of six tabs — **Home, Learn, Markets, Portfolio, Expenses, Assistant**. Each tab is its own `Stack`, so pushed sub-screens (`expenses/add`, `portfolio/manage`, `markets/[symbol]`) unmount/remount normally on push/pop. Settings is a sibling stack off Home's gear icon.

The tab bar is custom: Expo Router's stock `<Tabs>` container stays (safe areas, sizing); an animated icon and button (press-scale, haptic, a fading "active pill") are swapped in via `tabBarIcon` / `tabBarButton`.

**`<Tabs>` keeps every tab's root screen mounted in the background after its first visit** — switching tabs never re-triggers a mount effect or a Reanimated `entering=` animation. This is a deliberate constraint now (§7.3), not an oversight.

### 5.2 State — 15 Zustand stores (`store/`)

All persisted stores use AsyncStorage via `persist`. Cross-store calls go through `useXStore.getState()` — an established pattern, not an accident.

| Store | Purpose |
|---|---|
| `useExpenseStore` | Expenses, recurring-expense series (cursor-based catch-up), round-up-savings trigger on add |
| `useBudgetStore` | Overall + per-category monthly budgets |
| `useSavingsGoalStore` | Goals: create/contribute/delete, recurring auto-contributions, round-up target |
| `usePortfolioStore` | Multiple portfolios (Max), trades, dividends, limit orders, auto-invest, watchlist |
| `useMarketStore` | One `epoch` counter — bumping it re-seeds the whole mock market |
| `useStockViewStore` | Free-tier "5 lookups/day" gate + simulated ad-slot counter |
| `useStreakStore` | Daily streak, badge list, pattern/analyst counters |
| `useQuizStore` | Per-topic progress, spaced-repetition due dates, mastery |
| `useFlashcardStore` | Flashcard deck progress/history per topic |
| `useWeeklyRecapStore` | Caches the last AI weekly recap until manually refreshed |
| `useChatStore` | Assistant chat threads (general + per-symbol) |
| `useAiUsageStore` | Shared daily AI-action counter (only meaningful without a personal key) |
| `useSettingsStore` | Theme, accent, tier, AI provider/keys, notifications, biometric lock, broken-key flags |
| `useReviewStore` | Whether the in-app review prompt has fired |
| `useToastStore` | Global single-slot toast (not persisted) |

### 5.3 AI subsystem

`services/ai/client.ts` is the **single dispatch point for every AI feature** (chat, quizzes, daily challenges, pattern detection, receipt auto-fill, spending insight, weekly recap) — never call a provider file directly from a screen. It picks the user's provider + key (or falls back to a shared key), exposes `sendStructuredPrompt<T>()` as the workhorse for every "give me back JSON" feature, enforces `AI_FEATURE_DAILY_LIMIT[tier]` only while on a shared key, races Gemini against a shared OpenRouter free model when both are configured, and tracks broken personal keys so the UI can nudge instead of silently failing. Prompts live in `services/ai/prompts.ts`; error copy goes through `services/ai/errorMessage.ts`.

### 5.4 Market data

`services/marketData/marketData.ts` dispatches to `liveMarketData.ts` (Twelve Data) when a key is set, else `mockMarketData.ts` — fully local, deterministic, 400 days of seeded history per symbol. Live fetches are TTL-gated (6h bars / 60s quotes) and fall back to cached/mock data on failure. `computePortfolioVsBenchmark`'s date "spine" is anchored on `TICKERS[0]` (fine — it needs the full ticker universe anyway); `computeNetWorthHistory`'s spine is anchored on whichever *traded* symbol has the longest cached history. These are deliberately different — don't unify them.

### 5.5 Subscriptions

Free / Pro / Max. `constants/subscription.ts`'s `TIER_FEATURES` is the single source of truth for what unlocks per tier. Demo pricing: Pro $5/mo · $49.99/yr · $129.99 lifetime — Max $15/mo · $139.99/yr · $349.99 lifetime (real store prices once RevenueCat is configured). Without a RevenueCat key, the paywall shows a **dev-only tier switcher** instead of real purchases — intentional.

### 5.6 Notifications

Local-only, no backend. Three kinds, each idempotent: 8pm daily check-in, same-day 9pm "streak at risk" nudge, per-recurring-expense "due tomorrow" 9am nudge. All gated behind the notifications toggle *and* `TIER_FEATURES[tier].pushAlerts` (Pro/Max).

### 5.7 Gamification

`useStreakStore.awardBadge(id)` is a generic, idempotent one-off award. `constants/badges.ts` is the single badge registry — a new badge needs an entry there plus an `awardBadge` call. `app/settings/achievements.tsx` renders every entry, earned or locked.

## 6. Feature inventory, by tab

- **Home** — net worth/P&L stats, free-tier upsell, watchlist, quick actions, AI weekly recap
- **Learn** — streak/badges, spaced-repetition next-topic, flashcards, narrative daily challenge, full topic list; bank-first content with AI fallback
- **Markets** — searchable ticker list, watchlist stars, direction calls, practice trade, regenerate market, backtest (Max), per-symbol detail with forecast/sentiment (Pro+)
- **Portfolio** — multi-portfolio (Max), net worth history, vs-benchmark chart, holdings, diversification donut, auto-invest plans, dividend income, recent trades, share-as-image, leaderboard
- **Expenses** — filterable list, category donut, AI spending insight, budgets, savings goals (manual + recurring + round-up), CSV export
- **Assistant** — general + per-symbol chat threads, history, quota/broken-key messaging

## 7. Coding standards — non-negotiable, each backed by a real bug this project already shipped and fixed

1. **Zustand selector referential stability.** A selector passed to `useStore(selector)` must return an `Object.is`-stable value across calls against an unchanged snapshot. Never return a freshly built array/object/Set/Map (`.map()`, `.filter()`, `Array.from()`, spread, an inline literal) from inside a selector — it breaks `useSyncExternalStore` and can cause **"Maximum update depth exceeded"** (crashed the app on every open via `LimitOrderWatcher.tsx`). Select the store's own raw field; derive anything computed with `useMemo` in the component. A primitive return (`s.badges.length`) is always safe.
2. **Reanimated `entering=` must never share a native view with touch handling.** A view mid-entrance-animation can have unreliable touch hit-testing for its first tap or two. Entrance animation goes on a plain, non-touchable `Animated.View`; touch handling goes on a plain `Pressable` nested inside it — never `AnimatedPressable` carrying both `entering=` and `onPress` at once. (Bit six modal sheets + a flashcard flip-card — Submit needed "a few tries.")
3. **Tab entrance animations replay on every focus — via `useTabEntrance`, never via `entering=` or a remount key.** `<Tabs>` keeps every tab mounted (§5.1), so a plain `entering=` prop only ever plays once, on first mount. An early fix that forced a remount (a `key=` on the animated content) to replay it on every tab-focus was tried and reverted — remounting recreated every Pressable inside, multiplying exposure to rule #2's touch-hit-testing bug across every button on every tab switch. The fix that stuck: `hooks/useTabEntrance.ts` drives an ordinary animated style (opacity + translateY) off a shared value reset on every `useFocusEffect` focus — the underlying view is never unmounted, so nested Pressables keep native identity and rule #2 never triggers. It uses a plain `withTiming` ease, not a spring — a spring's overshoot read as a repeated "flutter" once it replays on every switch instead of once per session. Use this hook (not `entering=`) for any new tab-root section that should animate in.
4. **`useCallback` deps must include every prop function actually called inside the callback.** A handler that calls `props.onX?.(e)` but is memoized on unrelated deps will go stale and call an outdated closure. If you see a suppressed `react-hooks/exhaustive-deps` warning on a handler that forwards to a prop callback, that's a bug, not a style choice — fix the deps, don't suppress. (This exact bug in the custom tab bar was the most likely cause of "the Home button literally does not work.")
5. **Never reimplement month-arithmetic.** `Date.setMonth()` on a day that doesn't exist in the target month silently rolls into the following month (Jan 31 + 1 → "Mar 3"). Always use `utils/date.ts`'s `addMonthsStr`, which clamps to the real last day and is shared by every recurring schedule.
6. **Recurring/catch-up processing is always cursor-based.** Every "catch up N cycles since last time" feature (recurring expenses, dividends, limit orders, auto-invest, goal contributions, bill reminders) uses a *persisted cursor field*, advanced in a guard-capped `while` loop — never recomputed from what's currently visible in an array (breaks the moment an item is deleted and re-added).
7. **Historical-value date "spines" must come from the most-complete series**, not an arbitrary/first one, when reconstructing values day-by-day against cached price bars — see §5.4 for the one deliberate exception and why.
8. **Always import `Text` from `components/ui/Text`, never from `react-native`.** It's a drop-in wrapper that applies the user's font-family and text-scale settings (Settings › Learning Environment) — a no-op at the defaults, so it's always safe to use. Importing `Text` straight from `react-native` silently opts that screen out of both settings (this was true of ~150 screens before it was fixed app-wide in one pass). `AppText` (variant + color convenience) already delegates to it — don't reapply scale/family on top of `AppText`, that double-scales.

General style: no dead code, no speculative abstraction, no comments explaining *what* (only non-obvious *why*), match existing patterns in the file you're editing before introducing a new one.

## 8. Environment & secrets

Everything is optional and additive — the app is fully functional in demo mode with zero env vars set. Full docs in `Expense Tracker/.env.example`.

| Variable | Unlocks | Without it |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_*_API_KEY` | Real store purchases | Dev-only tier switcher |
| `EXPO_PUBLIC_SHARED_GEMINI_API_KEY` | AI features work without BYOK | User must add their own key |
| `EXPO_PUBLIC_SHARED_OPENROUTER_API_KEY` | Raced against Gemini for text features | Gemini-only fallback |
| `EXPO_PUBLIC_TWELVEDATA_API_KEY` | Real live-ish market data | Local mock random-walk engine |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting | No-op |

`eas.json`: `development` / `preview` / `production` build profiles. `app.json`: bundle id `com.nathgoa.mockstocktrainer`, scheme `mockstocktrainer`.

## 9. Current state (last updated: this session)

No open bugs, no half-finished features. Everything in §6 is built, typechecks clean, and is pushed to `main`. Tab entrance animations now replay on every focus (§7 rule #3) and the font/text-scale setting applies app-wide (§7 rule #8). All 8 modal backdrops (the original six plus two added since) use the split entrance/touch pattern from rule #2 — no known gap left there. EAS builds run under the `nathgoas-team` account, not a personal one; `app.json` should never carry a hardcoded `owner` or `extra.eas.projectId` — `eas init --account nathgoas-team` in the build workflow is the single source of truth for that.

A second contributor (Arya) also pushes features directly to `main` via their own Claude Code sessions — their commits show up authored as either "Claude" or their own name depending on how they ran it. Treat any push you didn't make yourself the same as a user-facing bug report: diff it against your last known-good state, run `tsc --noEmit` yourself rather than trusting a commit message's claim, and check `app.json` hasn't reverted the EAS `owner`.

**Known gaps**, not bugs:
- No automated tests exist (§3) — this is accepted, not a TODO, unless the user asks to add a test setup.

## 10. Suggested next steps (discussed, not started)

- **Debt/loan payoff tracker** — mirror of savings goals (balance going down instead of up); reuses the recurring-contribution and progress-bar machinery almost entirely. Lowest effort of the four.
- **Activity heatmap** — GitHub-style day-by-day grid of app activity, giving the streak/badge system a visual history.
- **Custom expense categories** — user-defined categories (icon/color) beyond the fixed list in `constants/categories.ts` + generic "Other."
- **Goal milestones on the net worth chart** — annotate `computeNetWorthHistory`'s chart with markers at each goal's `completedAt` date; both data sources already exist independently.

Otherwise: ask the user what they want next rather than assuming one of the above.
