import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Suppress Rollup's "named + default exports" warning: this is intentional
  // so consumers can use both `import ionic from '...'` and `import { ionicPlugin } from '...'`.
  rollupOptions: {
    output: { exports: 'named' },
  },
});
