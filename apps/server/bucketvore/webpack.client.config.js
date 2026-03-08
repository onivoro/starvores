const path = require('path');

module.exports = {
  entry: path.resolve(__dirname, 'src/app/client/s3-explorer.client.ts'),

  output: {
    path: path.resolve(__dirname, 'src/assets/scripts'),
    filename: 's3-explorer.bundle.js',
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.client\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.client.json')
          }
        },
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
  },

  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',

  // Optimize for browser
  target: 'web',

  optimization: {
    minimize: process.env.NODE_ENV === 'production',
  },
};
