import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // `.claude/**` مساحة أدوات لا مصدرًا، وقد تحوي نسخة عمل كاملة من المستودع
    // (worktree) فيفحصها eslint مرتين ويشتكي من ملفاتها المولَّدة.
    ignores: [".next/**", ".next-*/**", "node_modules/**", "out/**", "next-env.d.ts", ".claude/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
