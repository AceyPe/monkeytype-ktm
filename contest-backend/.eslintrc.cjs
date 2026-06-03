/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@monkeytype/eslint-config"],
  ignorePatterns: ["node_modules/", "dist/"],
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
