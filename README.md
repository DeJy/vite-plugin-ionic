# vite-plugin-ionic

Vite plugin that integrates [`@ionic/core`](https://ionicframework.com/) (Ionic web components) into any Vite project — framework-agnostic, Vite-version-agnostic.

## What it does

| Without the plugin | With the plugin |
|---|---|
| Add `optimizeDeps.exclude: ['@ionic/core']` manually | ✅ Done automatically |
| Mark `/ionic.esm.js` as external in build options | ✅ Done automatically |
| Use `vite-plugin-static-copy` to copy `dist/ionic/*` to output | ✅ Built-in, no extra dependency |
| Add a custom middleware to serve Ionic in dev mode | ✅ Built-in |
| Suppress LightningCSS `:host-context()` warning | ✅ Built-in (Vite 5.1+) |

## Install

```bash
npm install -D vite-plugin-ionic
# peer dependency (runtime):
npm install @ionic/core
```

## Usage

```js
// vite.config.js
import { defineConfig } from 'vite';
import ionic from 'vite-plugin-ionic';

export default defineConfig({
  plugins: [
    ionic(),
  ],
});
```

Then load Ionic in your app using one of two approaches:

### Option 1 — HTML `<script>` tag

Add the module directly in your `index.html`:

```html
<script type="module" src="/ionic.esm.js"></script>
```

### Option 2 — Dynamic import in your entry script

Use a dynamic import with `/* @vite-ignore */` so Vite doesn't try to resolve
or bundle the path (it is intentionally external and served as a static file):

```js
// main.js / main.ts
const ionicPath = '/ionic.esm.js';
await import(/* @vite-ignore */ ionicPath);
```

The `/* @vite-ignore */` comment is required — without it Vite will warn about
an unresolvable import and may attempt to bundle it.

Both approaches work identically in dev and production.

---

Works with React, Vue, Angular, Svelte, Mithril, or plain HTML.

## Options

```ts
interface IonicPluginOptions {
  /**
   * Package name for @ionic/core.
   * Override if you use a fork or a monorepo alias.
   * @default '@ionic/core'
   */
  ionicPackage?: string;

  /**
   * Suppress the LightningCSS warning about :host-context().
   * Ionic uses it for RTL support inside Shadow DOM — it is valid
   * but LightningCSS doesn't recognise it and emits a noisy warning.
   * Requires Vite 5.1+ (uses the onLog plugin hook).
   * @default true
   */
  suppressHostContextWarning?: boolean;
}
```

### Example with options

```js
ionic({
  suppressHostContextWarning: false, // keep the warning visible
  ionicPackage: '@my-fork/ionic-core',
})
```

## Compatibility

| Vite | Bundler | Supported |
|------|---------|-----------|
| 4.x  | Rollup  | ✅ |
| 5.x  | Rollup  | ✅ |
| 6.x  | Rolldown| ✅ |
| 7.x  | Rolldown| ✅ |

> **Note:** The `:host-context()` warning suppression uses the `onLog` plugin hook,
> which was added in Vite 5.1. On Vite 4 the hook is silently ignored and the warning
> may appear in your console — it is harmless.

## How it works

### Dev mode (`vite dev`)

Ionic files are served directly from `node_modules/@ionic/core/dist/ionic/` via a
Connect middleware. No files are copied — fast startup, no public directory pollution.

### Build mode (`vite build`)

All files from `node_modules/@ionic/core/dist/ionic/` are copied to the root of your
output directory (e.g. `dist/`) using Node's built-in `fs` APIs. No dependency on
`vite-plugin-static-copy`.

### Externals

`/ionic.esm.js` is declared external in `rollupOptions` (compatible with both Rollup
and Rolldown), so the bundler never tries to inline Ionic's runtime (which is already
copied as a standalone file).

## License

MIT © [Dominic Jean](https://github.com/DeJy)
