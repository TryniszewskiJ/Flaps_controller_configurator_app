// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const unusedImports = require('eslint-plugin-unused-imports');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

// Pliki aplikacji technika używane też przez aplikację użytkownika (user-app, alias @flaps/*)
const SHARED_FILES = [
  'src/app/app.component.ts',
  'src/app/core/auto-connect.service.ts',
  'src/app/core/ble/**/*.ts',
  'src/app/core/condition.ts',
  'src/app/core/connection.service.ts',
  'src/app/core/device-state.service.ts',
  'src/app/core/firmware/**/*.ts',
  'src/app/core/i18n/**/*.ts',
  'src/app/core/protocol/frame.ts',
  'src/app/core/protocol/protocol-client.ts',
  'src/app/core/settings.service.ts',
  'src/app/core/theme.service.ts',
  'src/app/shared/**/*.ts',
  'src/app/update/**/*.ts',
];

// Kod i protokół tylko dla technika
const TECHNICIAN_ONLY = [
  '**/protocol/gen/flaps_pb',
  '**/protocol/messages',
  '**/protocol/commands',
  '**/core/configuration.service',
  '**/core/can-sniff.service',
  '**/core/frame-log.service',
  '**/core/dev-telemetry.service',
  '**/core/dev-command.service',
  '**/core/current-sense-settings.service',
  '**/core/amp-out',
  '**/core/save-file',
  '**/core/can/**',
  '**/core/testing/**',
  '**/config/**',
  '**/canbus/**',
  '**/dev-console/**',
  '**/dashboard/**',
  '**/tabs/**',
  '**/technician-app',
];

const ISOLATION_MESSAGE =
  'Kod technika — niedostępny w kodzie wspólnym i w aplikacji użytkownika (izolacja).';

module.exports = tseslint.config(
  // Kod generowany z flaps.proto (npm run proto:gen)
  { ignores: ['src/app/core/protocol/gen/**'] },
  {
    files: ['**/*.ts'],
    ignores: ['projects/**/*'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      // Reguły oparte na typach (no-floating-promises itd.) wymagają informacji z tsconfig
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Page', 'Component'] }],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],

      // Jawny typ zwracany dla funkcji i metod
      '@typescript-eslint/explicit-function-return-type': 'error',

      // Nieużywane importy = błąd (z autofixem); nieużywane zmienne obsługuje unused-imports
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Promise'y — istotne przy asynchronicznej komunikacji BLE
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  // Kod wspólny z aplikacją użytkownika nie może sięgać do kodu ani protokołu technika —
  // do bundla użytkownika trafiłaby konfiguracja, CAN sniff itd. Sprawdza to też
  // scripts/check-user-bundle.mjs (npm run user:build).
  {
    files: SHARED_FILES,
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: TECHNICIAN_ONLY, message: ISOLATION_MESSAGE }] },
      ],
    },
  },
  // Aplikacja użytkownika: z kodu technika tylko to, co wspólne (@flaps/*), nic względnie
  {
    files: ['user-app/src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...TECHNICIAN_ONLY.map((pattern) => pattern.replace('**/', '@flaps/**/')),
                '@flaps/app.routes',
                '**/src/app/**',
              ],
              message: ISOLATION_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  // Formatowanie przez Prettier jako reguła ESLint; musi być ostatnie, żeby wyłączyć kolidujące reguły
  {
    ...prettierRecommended,
    files: ['**/*.ts', '**/*.html'],
  },
);
