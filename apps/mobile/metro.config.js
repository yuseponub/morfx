// Metro configuration for apps/mobile
// Expo SDK 54 defaults are sufficient — this file exists to make it
// explicit that apps/mobile/ runs its own Metro bundler, fully isolated
// from the root Next.js project. Do NOT reach outside apps/mobile/ for
// source files from here.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
