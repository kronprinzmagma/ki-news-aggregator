// ESLint-Konfiguration (flat config): nur die empfohlenen Regeln von ESLint
// (js/recommended), keine Stilregeln. Läuft in test.yml blockierend vor den
// Tests (Katalog C5).
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', '_site/', 'build-anchors/', 'evals/results/', '.claude/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Oberfläche der lokalen Review-UI läuft im Browser.
    files: ['evals/review-ui/app.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
];
