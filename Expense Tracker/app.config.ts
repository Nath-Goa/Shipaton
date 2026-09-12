import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const baseConfig = appJson.expo as ExpoConfig;

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const judgeBuild = process.env.EXPO_PUBLIC_APP_VARIANT === 'judge';
  const plugins = [...(baseConfig.plugins ?? [])];

  if (judgeBuild) {
    plugins.push('./plugins/withJudgeBuildType');
  }

  return {
    ...config,
    ...baseConfig,
    name: judgeBuild ? 'Markva Judge' : baseConfig.name,
    android: {
      ...baseConfig.android,
      package: judgeBuild ? 'com.nathgoa.markva.judge' : baseConfig.android?.package,
    },
    extra: {
      ...baseConfig.extra,
      appVariant: judgeBuild ? 'judge' : process.env.EXPO_PUBLIC_APP_VARIANT ?? 'development',
    },
    plugins,
  };
}
