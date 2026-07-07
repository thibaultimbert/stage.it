# Stage.it

Stage.it packages the **Shopify Product Photo Agent** for Codex. It helps turn live Shopify catalog media into staged product photography: pull product images from a Shopify store, generate preview candidates from the actual source pixels, and upload approved images back to Shopify as additional product media.

## Install From This Repo

This repository includes a repo-scoped Codex plugin marketplace:

```bash
codex plugin marketplace add thibaultimbert/stage.it
```

After adding the marketplace, open Codex Plugins and install **Shopify Product Photo Agent**.

For local development from this checkout:

```bash
codex plugin marketplace add .
```

Then open Codex Plugins, switch to the **Shopify Product Photo Agent** marketplace, and install the plugin.

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
