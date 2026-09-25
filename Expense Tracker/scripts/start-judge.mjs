// Starts the dev server in Shipaton judge mode, for judges running this repo
// from source instead of installing an APK — the same switch eas.json's
// "judge" profile flips. Any extra args (e.g. --android) pass straight
// through to `expo start`.
//
// EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY still comes from .env / .env.local
// (or the shell) like every other key. Without it judge mode still works:
// the plan screen offers the clearly labeled offline Max preview instead of
// the RevenueCat Test Store paywall. TEMPORARY with the rest of judge mode —
// see constants/judgeMode.ts.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_APP_VARIANT: 'judge' },
});
child.on('exit', (code) => process.exit(code ?? 0));
