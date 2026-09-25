# Markva — Stock Market Predictor and Tutor

Built for the **RevenueCat Shipaton** by **Nathan Kumtakar** and **Arya Kakani**.

Markva is a combined "financial life" app: **mock/paper stock trading** + a **personal expense tracker**, wrapped in one app so a RevenueCat subscription has enough real feature surface to gate meaningfully. Everything financial is simulated — no real brokerage, no real bank connection, no real money at risk. The pitch is educational: practice trading and budgeting with zero real-world downside, while learning the underlying concepts through a full Learn tab (lessons, flashcards, quizzes, daily trivia).

## For Shipaton judges — try it in two minutes

**[⬇ Download Markva-Judge.apk](https://github.com/Nath-Goa/Shipaton/releases/latest/download/Markva-Judge.apk)** and install it on any Android phone (allow installs from unknown sources when asked). No account, no keys, no setup.

1. Open the app and tap **"Yes, I'm a judge"**.
2. Go to Settings → Upgrade (or tap any locked feature) and pick **Pro** or **Max**.
3. The real RevenueCat paywall opens at the regular prices. Tap the purchase button, then **"Test valid purchase"** in the RevenueCat Test Store sheet.

That's RevenueCat's Test Store, so no card is needed and nothing is charged, but the entitlement comes from RevenueCat exactly as it would for a paying customer. The app installs as "Markva Judge", alongside any other copy.

**Friends & duels:** Markets → Portfolio → people icon → create an account (any email, no verification). **Markva Bot** has already sent you a friend request; accept it, tap Challenge, and the duel starts right away. You can also add a friend by email, or create a family and share its invite code.

> App code lives in [`Expense Tracker/`](./Expense%20Tracker) — that's the actual Expo project root. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a full map of the repo, and [`CLAUDE.md`](./CLAUDE.md) for the complete build history and design rationale behind every feature.

## RevenueCat integration

RevenueCat gates a real three-tier subscription (**Free / Pro / Max**) across the app — see [`constants/subscription.ts`](<./Expense%20Tracker/constants/subscription.ts>) for the full feature matrix. Highlights of the integration:

- `react-native-purchases` + `react-native-purchases-ui` for native paywalls, entitlement checks, and customer-info sync (`services/purchases/`).
- Handles the real-world gap between RevenueCat's default umbrella entitlement and a per-tier `"pro"`/`"max"` check, rather than trusting the SDK's own `presentPaywallIfNeeded` to match tier-for-tier.
- Distinguishes a genuinely unconfigured project (falls back to a local dev-mode tier switcher) from a *configured but failing* paywall (surfaces the real RevenueCat error instead of misdirecting the user).
- **Judge mode**: a dedicated internal build variant shows "Are you a judge?" on first launch. Yes routes every subscribe button through RevenueCat's real **Test Store** — the actual paywall UI, resolved against a real Offering, unlocked only once a judge taps "Test valid purchase" inside RevenueCat's own Test Store UI (a real `CustomerInfo`/entitlement, no Play Billing, no card). This exists specifically so the RevenueCat integration is reviewable exactly as a paying user would experience it. See [`constants/judgeMode.ts`](<./Expense%20Tracker/constants/judgeMode.ts>) and CLAUDE.md §5.11 for the full design.

## Feature tour

| Tab | What's there |
|---|---|
| **Home** | Net worth/P&L, watchlist, quick actions, a "Weekly Recap" Wrapped-style card deck |
| **Learn** | Streaks/badges, spaced-repetition topics, flashcards, an AI-narrated daily challenge, a daily trivia battle vs. a seeded AI opponent, and 4 lesson modes per course (Standard / ELI5 / AI-generated Story / Pro+Visual with curated video) |
| **Markets** | Searchable stock list (100 curated tickers, plus live fallback search for anything else), a trained price-direction predictor, forecast/sentiment, product scanner (photo → AI company ID → live price/news), a $100k-vs-AI investing arena, and **Portfolio** (multi-portfolio, net-worth history, dividends, auto-invest, leaderboard, friends/family/duels) |
| **News** | InShort-style swipeable market news feed with an automatic AI explainer per headline |
| **Expenses** | Filterable list, category breakdown, AI spending insight, budgets, savings goals, CSV export |
| **Assistant** | General + per-symbol AI chat with history and quota/key management |

## Tech stack

Expo SDK 57 · React Native · TypeScript · expo-router · Zustand (`persist` + AsyncStorage) · react-native-reanimated · RevenueCat · Supabase (optional accounts/social features) · Sentry · direct HTTP integrations with Claude, OpenAI, Gemini, and OpenRouter for every AI feature (no SDK abstraction layer).

## Running it locally

```bash
cd "Expense Tracker"
npm install
npx expo start
```

To run judge mode from source instead of the APK, use `npm run judge` (needs `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` in `.env` for the Test Store paywall; without it, the plan screen offers a labeled offline Max preview).

The app is fully functional with **zero environment variables set** — every integration (RevenueCat, live market data, AI providers, Supabase, Sentry) degrades gracefully to a local/demo mode without a key. See [`Expense Tracker/.env.example`](<./Expense%20Tracker/.env.example>) for what each optional variable unlocks.

## Privacy

See [`Expense Tracker/PRIVACY.md`](<./Expense%20Tracker/PRIVACY.md>) for the full data-handling policy — local-first storage, what each third-party integration receives, and the under-18 compliance layer that gates AI photo uploads, accounts, purchases, and engagement nudges for teen users.

## License

MIT — see [`LICENSE`](./LICENSE).
