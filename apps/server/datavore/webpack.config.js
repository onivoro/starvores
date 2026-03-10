const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { join } = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const distRoot = join(__dirname, '../../../dist');
  const browserDist = join(distRoot, 'apps/browser/datavore');
  const serverDist = join(distRoot, 'apps/server/datavore');

  return {
    output: {
      path: serverDist,
    },
    plugins: [
      new NxAppWebpackPlugin({
        target: 'node',
        compiler: 'tsc',
        main: './src/main.ts',
        tsConfig: './tsconfig.app.json',
        assets: ['./src/assets'],
        optimization: isProduction,
        outputHashing: 'none',
        generatePackageJson: true,
      }),
      // Copy built browser assets into server dist for self-contained distribution
      new CopyPlugin({
        patterns: [
          {
            from: browserDist,
            to: join(serverDist, 'assets', 'ui'),
            noErrorOnMissing: true,
          },
        ],
      }),
      {
        apply: (compiler) => {
          compiler.hooks.emit.tapAsync('AddShebangPlugin', (compilation, callback) => {
            const mainJs = compilation.assets['main.js'];
            if (mainJs) {
              const originalSource = mainJs.source();
              const withShebang = `#!/usr/bin/env node\n${originalSource}`;
              compilation.assets['main.js'] = {
                source: () => withShebang,
                size: () => withShebang.length,
              };
            }
            callback();
          });
        },
      },
    ],
    node: {
      __dirname: false,
      __filename: false,
    },
  };
};
