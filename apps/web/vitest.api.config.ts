import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    css: { postcss: { plugins: [] } },
    test: {
      include: ["src/**/*.api.test.ts"],
    },
  }),
);
