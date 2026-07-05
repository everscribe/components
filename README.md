<p align="center">
  <img src="assets/everscribe.svg" alt="Everscribe" height="64">
</p>

<h1 align="center">Everscribe components</h1>

<p align="center">
  <img src="assets/react.svg" alt="React" height="44" align="middle">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/vue.svg" alt="Vue" height="44" align="middle">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/angular.svg" alt="Angular" height="44" align="middle">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/svelte.svg" alt="Svelte" height="44" align="middle">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/typescript.svg" alt="TypeScript" height="44" align="middle">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  Open source embeddable audit-trail UI for <a href="https://everscribe.io">Everscribe</a>.<br>
  Drop a branded, live activity log into your single or multi-tenant product.
</p>

<p align="center">
  <sub>Screenshot from the <a href="https://github.com/everscribe/examples">full-stack runnable examples</a>.</sub>
</p>

<p align="center">
  <img src="assets/preview.png" alt="Embedded Everscribe activity log" width="820">
</p>

<div align="center">

## 📖 Documentation

Start with the [prerequisites](https://everscribe.io/docs/web-components/prerequisites)
for the embed flow, token minting, refresh, and secret rotation. Per-package reference:

| Package | Documentation |
|---|---|
| [`@everscribe/components-react`](packages/react#readme) | [React](https://everscribe.io/docs/web-components/react) |
| [`@everscribe/components-element`](packages/element#readme) | [Web component](https://everscribe.io/docs/web-components/vanilla) |
| [`@everscribe/components-core`](packages/core#readme) | [Core](https://everscribe.io/docs/web-components/core) |
| [`@everscribe/components-styles`](packages/styles#readme) | [Styles](https://everscribe.io/docs/web-components/styles) |

> **Vue, Angular, and Svelte** (shown above) are covered by [`@everscribe/components-core`](packages/core#readme), the framework-agnostic data layer whose observable stores plug into any framework's reactivity, so you can build the audit-trail UI in whatever stack you use. The `<audit-trail>` [Web component](packages/element#readme) is a drop-in alternative that works in all three as well.

</div>

