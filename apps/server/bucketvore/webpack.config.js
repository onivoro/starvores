const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const { writeFileSync, mkdirSync } = require('fs');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    output: {
      path: join(__dirname, '../../../dist/apps/server/bucketvore'),
    },
    plugins: [
      new NxAppWebpackPlugin({
        target: 'node',
        compiler: 'tsc',
        main: './src/main.ts',
        tsConfig: './tsconfig.app.json',
        assets: ["./src/assets"],
        optimization: isProduction,
        outputHashing: 'none',
        generatePackageJson: true,
        // Exclude client-side TypeScript files from server bundle
        exclude: ['**/*.client.ts'],
      }),
      // Add shebang to the main.js file
      {
        apply: (compiler) => {
          compiler.hooks.emit.tapAsync('AddShebangPlugin', (compilation, callback) => {
            const mainJs = compilation.assets['main.js'];
            if (mainJs) {
              const originalSource = mainJs.source();
              const withShebang = `#!/usr/bin/env node\n${originalSource}`;
              compilation.assets['main.js'] = {
                source: () => withShebang,
                size: () => withShebang.length
              };
            }
            callback();
          });
        }
      },
      // Create library-style entry point using the built TypeScript outputs
      {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tapAsync('CreateLibraryEntryPlugin', (compilation, callback) => {
            const outputPath = compilation.outputOptions.path;
            const srcDir = join(outputPath, 'src');

            try {
              // Create src directory
              mkdirSync(srcDir, { recursive: true });

              // Create index.js that re-creates the bootstrap function for library use
              const indexJs = `const { NestFactory } = require('@nestjs/core');

// Load the app module class directly from dependencies
async function bootstrap() {
  try {
    // Try to dynamically import the module
    const { AppServerBucketvoreModule } = await import('./app-server-bucketvore.module.js').catch(() => {
      // Fallback: require from node_modules or relative path
      throw new Error('AppServerBucketvoreModule not found. Make sure dependencies are installed.');
    });

    const app = await NestFactory.create(AppServerBucketvoreModule, { logger: console });
    const port = process.env.HTTP_PORT || 3007;
    await app.listen(port);
    console.log(\`BucketVore available at: http://localhost:\${port}\`);
    return app;
  } catch (error) {
    console.error('Failed to bootstrap BucketVore application:', error);
    throw error;
  }
}

module.exports = { bootstrap };
`;
              writeFileSync(join(srcDir, 'index.js'), indexJs);

              // Create index.d.ts for TypeScript support
              const indexDts = `import { INestApplication } from '@nestjs/common';

/**
 * Bootstrap the BucketVore NestJS application
 * @returns Promise that resolves to the NestJS application instance
 */
export declare function bootstrap(): Promise<INestApplication>;
`;
              writeFileSync(join(srcDir, 'index.d.ts'), indexDts);

            } catch (error) {
              console.error('Error creating library entry point:', error);
            }

            callback();
          });
        }
      }
    ],
    externals: {
      // Keep external dependencies as externals so they don't get bundled
    }
  };
};
