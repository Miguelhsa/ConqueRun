const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Firebase iOS + use_frameworks: static needs this Podfile global.
// react-native-maps also needs a narrow module-map tweak with static frameworks.
const withReactNativeMapsfix = (config) =>
  withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      contents = contents
        .replace(/\n\s*# \[ConqueRun\] RNFirebase static framework\n\s*\$RNFirebaseAsStaticFramework = true\n/g, '\n')
        .replace(/\n\s*\$RNFirebaseAsStaticFramework = true\n/g, '\n');

      if (!contents.includes('[ConqueRun] RNFirebase static framework')) {
        contents = contents.replace(
          /(prepare_react_native_project!\r?\n)/,
          '$1\n# [ConqueRun] RNFirebase static framework\n$RNFirebaseAsStaticFramework = true\n'
        );
      }

      const blocks = [];

      if (
        !contents.includes('[ConqueRun] react-native-maps static framework fix') &&
        !contents.includes("next unless t.name == 'react-native-maps'")
      ) {
        blocks.push([
          "  # [ConqueRun] react-native-maps static framework fix",
          '  installer.pods_project.targets.each do |t|',
          "    next unless t.name == 'react-native-maps'",
          '    t.build_configurations.each do |bc|',
          "      bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
          "      bc.build_settings['DEFINES_MODULE'] = 'NO'",
          '    end',
          '  end',
        ].join('\n'));
      }

      if (
        !contents.includes('[ConqueRun] RNFirebase non-modular headers fix') &&
        !contents.includes("next unless t.name.start_with?('RNFB')")
      ) {
        blocks.push([
          "  # [ConqueRun] RNFirebase non-modular headers fix",
          '  installer.pods_project.targets.each do |t|',
          "    next unless t.name.start_with?('RNFB')",
          '    t.build_configurations.each do |bc|',
          "      bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
          '    end',
          '  end',
        ].join('\n'));
      }

      if (
        !contents.includes('[ConqueRun] fmt consteval fix') &&
        !contents.includes("installer.sandbox.pod_dir('fmt')")
      ) {
        blocks.push([
          "  # [ConqueRun] fmt consteval fix for Xcode 26.4+",
          "  fmt_base = File.join(installer.sandbox.pod_dir('fmt'), 'include', 'fmt', 'base.h')",
          '  if File.exist?(fmt_base)',
          '    fmt_content = File.read(fmt_base)',
          "    patched_fmt = fmt_content.gsub(/^#\\s*define FMT_USE_CONSTEVAL 1$/, '#  define FMT_USE_CONSTEVAL 0')",
          '    if patched_fmt != fmt_content',
          '      File.chmod(0644, fmt_base)',
          '      File.write(fmt_base, patched_fmt)',
          '    end',
          '  end',
        ].join('\n'));
      }

      if (blocks.length > 0) {
        const patched = contents.replace(
          /(post_install do \|installer\|)(\r?\n)/,
          `$1$2${blocks.join('\n')}\n`
        );

        if (patched === contents) {
          console.warn('[withReactNativeMapsfix] post_install block not found - patch not applied.');
          return config;
        }

        contents = patched;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);

module.exports = withReactNativeMapsfix;
