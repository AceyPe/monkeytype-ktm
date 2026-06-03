/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@monkeytype/eslint-config"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "tsup.config.js",
    "tsup.config.*.mjs",
    "vitest.config.ts",
  ],
  parserOptions: {
    project: "./tsconfig.eslint.json",
    tsconfigRootDir: __dirname,
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.eslint.json",
      },
    },
  },
};
