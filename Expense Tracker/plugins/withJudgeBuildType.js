const { withAppBuildGradle } = require('expo/config-plugins');

const BLOCK_START = '// @generated begin judge-build-type';
const BLOCK_END = '// @generated end judge-build-type';

const JUDGE_BUILD_TYPE = `
${BLOCK_START}
// RevenueCat Test Store rejects release APKs. This variant keeps Android's
// debuggable flag while inheriting the production runtime and embedded bundle.
android {
    buildTypes {
        judge {
            initWith buildTypes.release
            debuggable true
            signingConfig signingConfigs.debug
            matchingFallbacks = ['release']
        }
    }
}
${BLOCK_END}
`;

module.exports = function withJudgeBuildType(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('The standalone judge build requires a Groovy Android build.gradle file.');
    }

    if (!modConfig.modResults.contents.includes(BLOCK_START)) {
      modConfig.modResults.contents = `${modConfig.modResults.contents.trimEnd()}\n${JUDGE_BUILD_TYPE}`;
    }

    return modConfig;
  });
};
