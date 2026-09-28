// Minimal ESLint 9 flat config — the app is a CRA project, so react-scripts
// runs its own lint at build/dev time. This file only exists to satisfy
// standalone `npx eslint …` invocations (e.g. pre-completion linters).
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "public/**",
      "plugins/**",
      "scripts/**",
    ],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        process: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        ResizeObserver: "readonly",
        AbortController: "readonly",
        FormData: "readonly",
        File: "readonly",
        Blob: "readonly",
        URL: "readonly",
        MediaRecorder: "readonly",
        TextDecoder: "readonly",
        Audio: "readonly",
        Date: "readonly",
        Math: "readonly",
        Infinity: "readonly",
        Promise: "readonly",
        JSON: "readonly",
      },
    },
  },
];
