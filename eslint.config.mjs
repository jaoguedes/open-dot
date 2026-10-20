// ESLint (F2): TypeScript, regras de hooks do React e acessibilidade (jsx-a11y).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "apps/runner/src-tauri/target/**", "apps/runner/src-tauri/gen/**", "node_modules/**", ".wrangler/**", "blender/**", "apps/web/public/**", "docs/**", "**/*.d.mts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["apps/web/src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ["**/test/**", "tests/**", "scripts/**"],
    rules: { "@typescript-eslint/no-unused-expressions": "off" },
  },
);
