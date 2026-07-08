# Stage.it

[**Stage.it**](https://thibaultimbert.github.io/stage.it) is a [Codex](https://https://openai.com/codex/) plugin that creates stunning product photos from your Shopify product catalog: it pulls product images from any Shopify store, generate preview candidates for you to review based on your asks, upload approved images back to Shopify directly in the product listings.

Codex prompt: _Stage.it, update my catalog for the upcoming Thanksgiving season:_

Before:

<img width="543" height="679" alt="001-italian-garden-candle-73622045491545" src="https://github.com/user-attachments/assets/4893c623-959b-422f-adfb-e929aa8e7bb5" />

After:

<img width="543" height="724" alt="03-italian-harvest-thanksgiving-lit-lid-off" src="https://github.com/user-attachments/assets/9f12f3ce-9840-4a62-bdf7-c85a7f52eedf" />


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

- Authenticates with Shopify through Shopify CLI.
- Pulls product media and writes local manifests.
- Uses the real product image as the generation reference.
- Produces product-photo previews in portrait `3:4`.
- Uploads only when explicitly requested.
- Adds generated images as additional media by default.

## Landing Page

The static landing page lives in `site/`. This repo includes a GitHub Pages workflow that uploads that folder as the site artifact.

The landing page's **Install in Codex** button opens a new Codex thread with a prefilled install request. The CLI command above remains the most reliable install path for first-time users because Codex needs to know this marketplace before it can show the plugin in the plugin directory.
