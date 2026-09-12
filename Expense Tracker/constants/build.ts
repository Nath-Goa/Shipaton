export type AppVariant = 'development' | 'judge' | 'production';

const configuredVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

export const APP_VARIANT: AppVariant =
  configuredVariant === 'judge' || configuredVariant === 'production'
    ? configuredVariant
    : 'development';

export const IS_JUDGE_BUILD = APP_VARIANT === 'judge';
