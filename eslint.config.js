// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint rules, checked by `npm run lint`. `tsc` checks types, dependency-cruiser checks who imports
 * whom, ESLint catches bug-prone code, Prettier owns formatting.
 */
export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**"] },
  eslint.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      // Only the command line entry points talk to the terminal; the rest returns values.
      "no-console": "error",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: { module: "writable" } },
  },
  {
    files: ["src/main.ts", "src/commands.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
