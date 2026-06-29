import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/**
 * ESLint flat config.
 *
 * Scope is intentionally limited to the typed frontend (`client/**\/*.{ts,tsx}`)
 * during the Vite + TS + React migration. Linting the ~30K lines of legacy
 * untyped `.js` would drown real findings in noise; the scope widens
 * automatically as the legacy surface is deleted phase by phase.
 */
export default tseslint.config(
  {
    // Global ignores — everything except the typed client is out of scope for now.
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-ssr/**",
      "client/**/*.js",
      "server/**",
      "shared/**",
      "checks/**",
      "chrome-extension/**",
      "*.js",
      "*.cjs"
    ]
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Allow intentional unused via leading underscore; warn (not error) otherwise.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      // The legacy bridge still relies on `window.PartyGame*` globals typed as any;
      // downgrade to warn so the gate isn't blocked while adapters are being removed.
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  // Disable stylistic rules that conflict with Prettier — Prettier owns formatting.
  prettier
);
