module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    // 空 catch 用于吞掉可预期的异常（如页面不支持某 API）
    "no-empty": ["error", { allowEmptyCatch: true }],
    // 共享模块在自身文件中定义，同时作为全局变量供其他脚本使用
    "no-redeclare": ["error", { builtinGlobals: false }],
  },
  globals: {
    chrome: true,
    module: true,
    Clipboard: "readonly",
    // 扩展内各脚本通过 manifest / importScripts / <script> 按顺序加载，共享以下全局模块
    I18n: "readonly",
    TextCleaner: "readonly",
    ContentType: "readonly",
    HistoryStore: "readonly",
    HtmlToMarkdown: "readonly",
    CopyFormatter: "readonly",
    HistoryPanel: "readonly",
    initSettingsPage: "readonly",
    escapeHTML: "readonly",
  },
  overrides: [
    {
      files: ["extension/background.js"],
      env: { serviceworker: true },
    },
    {
      files: ["tests/**/*.js"],
      env: { node: true },
    },
  ],
};
