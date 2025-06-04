const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Load environment variables from .env file
const env = dotenv.config().parsed || {};

// Create environment variables to inject into the bundle
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

// Add React environment variables by default
envKeys['process.env.NODE_ENV'] = JSON.stringify(process.env.NODE_ENV || 'development');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin(envKeys),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      favicon: './public/favicon.ico'
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx']
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'public')
    },
    historyApiFallback: true,
    port: 3000,
    hot: true,
    open: true,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:8080',
        pathRewrite: { '^/api': '' },
        changeOrigin: true
      },
      '/ws': {
        target: process.env.API_URL || 'http://localhost:8080',
        ws: true,
        changeOrigin: true
      }
    }
  }
};