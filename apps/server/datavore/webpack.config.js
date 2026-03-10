const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    output: {
      path: join(__dirname, '../../../dist/apps/server/datavore'),
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
