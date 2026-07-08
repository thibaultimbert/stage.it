# Stage.it

[**Stage.it**](https://thibaultimbert.github.io/stage.it) is a [Codex](https://https://openai.com/codex/) plugin that creates stunning product photos from your Shopify product catalog: it pulls product images from any Shopify store, generate preview candidates for you to review based on your asks, upload approved images back to Shopify directly in the product listings. All autonomously for you.

Codex prompt: _Stage.it, update my catalog with new photos:_

Before:

<img width="690" height="690" alt="listing-before" src="https://github.com/user-attachments/assets/aeb50d10-1d6c-420b-8b8d-b5d08b3bce5c" />

After:

<img width="690" height="686" alt="listing-after" src="https://github.com/user-attachments/assets/8d80d245-eef2-4cb9-81d8-77c5d0d46cf5" />

## Install From This Repo

This repository includes a repo-scoped Codex plugin marketplace:

```bash
codex plugin marketplace add thibaultimbert/stage.it
```

After adding the marketplace, open Codex Plugins and install **Stage.it**.

For local development from this checkout:

```bash
codex plugin marketplace add .
```

Then open Codex Plugins, switch to the **Stage.it** marketplace, and install the plugin.

## What It Does

- Authenticates with Shopify through [Shopify CLI](https://shopify.dev/docs/api/shopify-cli).
- Pulls product media and writes local manifests.
- Uses the real product image as the generation reference.
- Produces product-photo previews in portrait `3:4`.
- Uploads only when explicitly requested.
- Adds generated images as additional media by default.

## Landing Page

The static landing page lives in `site/`. This repo includes a GitHub Pages workflow that uploads that folder as the site artifact.

The landing page's **Install in Codex** button opens a new Codex thread with a prefilled install request. The CLI command above remains the most reliable install path for first-time users because Codex needs to know this marketplace before it can show the plugin in the plugin directory.
