/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@monkeytype/eslint-config"],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "tsup.config.js",
    "tsup.config.*.mjs",
  ],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
};
