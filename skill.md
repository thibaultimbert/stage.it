---
name: stage-it
description: Use when a user wants Codex to connect to any Shopify store, extract product catalog images, generate new AI product photography from the actual product images, preview the results, and upload approved or explicitly requested images back to Shopify product listings.
---

# Stage.it

This skill lets Codex act as a product-photo assistant for any Shopify store. In a fresh chat, ask only one required setup question if the user has not already provided it:

```text
What is your Shopify store address? Please send the .myshopify.com domain if you have it; otherwise the public store URL is fine.
```

After that, proceed autonomously: install or locate Shopify CLI, authenticate, pull product images, generate product-photo previews from the actual product images, and upload generated media when the user has explicitly asked to update the store.

## Operating Contract

Default behavior:

1. Ensure Shopify CLI is installed and callable.
2. Authenticate to the store with the required Admin API scopes.
3. Resolve the permanent `.myshopify.com` domain if the provided store URL redirects.
4. Pull product media and create a local catalog manifest.
5. Generate new product photography with a pixel-preserving workflow by default: create or edit the scene, then composite the original product pixels into it. Do not re-render the product unless the user explicitly approves product re-rendering.
6. Always show generated previews and wait for approval before uploading.
7. After approval, upload acceptable generated images as additional Shopify product media.
8. Verify uploaded media is `READY` and save an upload manifest.

Safety defaults:

- Never delete or replace existing product media unless explicitly requested.
- Add generated images as additional media by default.
- Never upload generated images without first presenting previews for user approval.
- Product pixels are sacred by default: preserve the original product, label, logo, package text, geometry, proportions, material, and color. Prompting alone is not enough protection.
- Never present an image with a changed label, logo, invented readable text, altered package shape, or altered product proportions as an upload candidate. Mark it failed and regenerate with a safer workflow.
- Ask before any workflow that will re-render the product itself. Explain that re-rendering can change labels, logos, package text, and geometry.
- Warn before upload if label/logo/text drift could misrepresent the product.
- Keep local manifests for every pull, generation run, and upload.
- Use portrait `3:4` product-gallery images unless the user requests another format.

## Shopify CLI Bootstrap

Official Shopify CLI docs: https://shopify.dev/docs/api/shopify-cli

Shopify CLI command syntax:

```bash
shopify [topic] [command]
```

Shopify documents these requirements:

- Node.js 22.12 or higher
- npm, Yarn 1.x, or pnpm
- Git 2.28.0 or higher

If `shopify` is missing, install it with one of Shopify's documented package-manager commands:

```bash
npm install -g @shopify/cli@latest
```

```bash
yarn global add @shopify/cli@latest
```

```bash
pnpm install -g @shopify/cli@latest
```

On macOS, Shopify also documents Homebrew:

```bash
brew tap shopify/shopify
brew install shopify-cli
```

Verify:

```bash
shopify version
shopify help
```

If npm installed the CLI but `shopify` is not on PATH, find it and use the absolute path rather than blocking:

```bash
npm root -g
npm list -g --depth=0 | rg '@shopify/cli|shopify'
ls -la ~/.npm-global/bin/shopify /opt/homebrew/bin/shopify /usr/local/bin/shopify 2>/dev/null
```

## Store Address And Auth

Official store auth docs: https://shopify.dev/docs/api/shopify-cli/store/store-auth

Normalize the user's store address:

- Strip protocol, path, query, and trailing slash.
- Prefer the permanent `.myshopify.com` domain.
- If `shopify store auth` reports a callback store mismatch, rerun auth with the permanent domain from the error message.

Scopes:

- Preview/read-only workflow: `read_products`
- Upload/update workflow: `read_products,write_products`

If the user asked to update the listing, request both read and write scopes up front:

```bash
shopify store auth \
  --store <store.myshopify.com> \
  --scopes read_products,write_products
```

The CLI may open a browser. If the CLI later prints `Logged in` and `Authenticated`, continue even if the user did not see the browser page.

## Admin GraphQL With Shopify CLI

Official store execute docs: https://shopify.dev/docs/api/shopify-cli/store/store-execute

Use `shopify store execute` for Admin API GraphQL queries and mutations.

Read query example:

```bash
shopify store execute \
  --store <store.myshopify.com> \
  --json \
  --query 'query { shop { name id } }'
```

Mutations are disabled by default. Use `--allow-mutations` only when intentionally writing:

```bash
shopify store execute \
  --store <store.myshopify.com> \
  --json \
  --allow-mutations \
  --query-file mutation.graphql \
  --variable-file variables.json
```

Important: Shopify CLI JSON output files can omit the top-level GraphQL `data` wrapper. Inspect the saved JSON shape before parsing.

## Pull Product Images

Export layout:

```text
exports/shopify-catalog-images/
  catalog-media.json
  manifest.json
  images/
    001-product-handle-media-id.ext
```

Use this query and page while `hasNextPage` is true:

```graphql
query CatalogImages($after: String) {
  products(first: 250, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      legacyResourceId
      title
      handle
      status
      featuredMedia {
        id
        mediaContentType
        alt
        preview { image { url altText width height } }
      }
      media(first: 50) {
        nodes {
          id
          alt
          mediaContentType
          preview { image { url altText width height } }
          ... on MediaImage { image { url altText width height } }
        }
      }
      variants(first: 100) {
        nodes { id title image { id url altText width height } }
      }
    }
  }
}
```

Manifest requirements:

```json
{
  "store": "<store.myshopify.com>",
  "exportedAt": "<iso date>",
  "productCount": 0,
  "imageCount": 0,
  "images": [
    {
      "productId": "gid://shopify/Product/...",
      "productTitle": "Product title",
      "productHandle": "product-handle",
      "productStatus": "ACTIVE",
      "mediaId": "gid://shopify/MediaImage/...",
      "mediaAlt": "",
      "width": 1500,
      "height": 1875,
      "sourceUrl": "https://cdn.shopify.com/...",
      "localPath": "exports/shopify-catalog-images/images/001-product-media.ext"
    }
  ]
}
```

Download every selected image URL locally. Preserve Shopify media IDs even if images appear duplicated. CDN extensions can be misleading, so validate downloaded bytes with `file`.

## Select Source Images

For each product:

1. Prefer the first product media image with `mediaContentType == IMAGE`.
2. If there are multiple meaningful angles, pick the best hero image unless the user asked to process every image.
3. Do not generate from duplicate-looking media records unless the user requested per-media processing.
4. Keep a generation manifest mapping product ID, handle, source media ID, source image path, prompt, generated paths, and eventual Shopify media IDs.

## Product Photography Generation

Core rule: start from pixels, not prose.

Default rule: preserve the original product pixels. The safest production workflow is not "ask the image model to preserve the product"; it is "do not give the image model permission to redraw the product."

Use this pixel-preserving workflow by default:

1. Extract the product from the source image or create a product mask.
2. Generate or edit only the scene/background at the target aspect ratio.
3. Composite the original product pixels into the generated scene.
4. Add scene-matched shadow, contact shadow, reflection, color balance, and edge blending around the product without changing the product itself.
5. If small retouching is needed, mask-protect the label, logo, package text, product silhouette, and core product surfaces.
6. Verify against the source image before presenting previews.

Only use whole-image product re-rendering after explicit user approval. If approved, the prompt should describe the new environment and product state, not recreate the product design from text.

Product-state changes are not free. Opening a package, removing a lid, lighting a candle, showing wax, changing fill level, wearing apparel, or showing usage may require re-rendering part of the product. Before doing this, choose the least risky route:

- Prefer a real Shopify source image that already shows the desired product state.
- Otherwise preserve the visible label/logo/package pixels and modify only the state-specific area with a tight mask.
- If a whole-product re-render is unavoidable, ask the user first and mark the run as `product-rerender-approved` in the manifest.

Good:

```text
Use the uploaded product image as the source of truth. Put this exact product into a Tuscan Thanksgiving table scene. Preserve the product, label layout, logo placement, proportions, material, color, and single-product composition.
```

Bad:

```text
Create an amber candle jar with a white label reading ITALIAN GARDEN...
```

The bad pattern often causes invented labels, altered logos, changed package text, and wrong proportions.

Better default:

```text
Generate a Tuscan Thanksgiving table scene with an empty product placement area, realistic light, and a matching contact surface. The original product will be composited later and must not be re-rendered.
```

### Contextual Scene Selection

Before generating, infer the product's natural world from:

- product title and handle
- product type/category if available
- product image contents
- materials, colors, packaging, and use case
- brand or scent/flavor/style cues visible in the product name or label
- season/campaign requested by the user

Scenes should feel specific to the product, not generic ecommerce backgrounds.

Examples:

- A candle named `Italian Garden` should be staged in Mediterranean garden, herb, stone terrace, spa, or warm home-ritual environments, depending on the campaign.
- A pair of running sneakers should be shown on feet or on a human in an athletic environment, such as a track, city run, gym warmup, trail, or lifestyle streetwear scene that matches the sneaker's style.
- A luxury skincare serum should be shown in a bathroom vanity, spa shelf, morning routine, or ingredient-led scene.
- A kitchen product should appear in a kitchen, dining, hosting, or ingredient-prep environment.
- A children's toy should appear in a safe, playful family environment.

When in doubt, generate three distinct preview concepts per product:

1. A practical use-case scene showing how the product is used.
2. A lifestyle/aspirational scene matching the product's brand vibe.
3. A seasonal/campaign scene if the user requested a season or promotion.

For wearable products, include a human/model only when it helps the buyer understand fit, scale, or use. Preserve realism, anatomy, and product placement.

Prompt template:

```text
Use case: product-photo-edit
Input image role: source product image / edit target
Primary request: Put this exact product into <scene>.

Preserve from the source image:
- one product only
- product silhouette and proportions
- material, color, and surface texture
- label placement and visible label layout
- logo placement and typography as much as possible
- cap/lid color and shape, unless the user asks for a state change

Product state:
<cap on / cap removed / lit / unlit / product closed / product open>

Scene:
<environment, props, lighting, season, mood, camera/lens/framing>

Avoid:
no duplicate products, no redesigned label, no new logo, no invented packaging text,
no warped or smeared text, no fake brand names, no watermark, no impossible product geometry.
```

State changes must be explicit:

```text
Remove the cap and place it beside the jar. The candle is open and lit, with cream wax visible and one small realistic flame from a centered wick.
```

For seasonal campaigns, keep the product stable and vary only the scene. Example:

```text
Italian harvest Thanksgiving, late-autumn garden, olive branches, figs, pears, rosemary, linen, terracotta, warm stone, muted cream and sage heirloom gourds. Avoid giant orange pumpkins, fake snow, red/green Christmas styling, and American farmhouse cliches.
```

Tool guidance:

- Use Codex's native GPT image capability for generation and editing.
- Treat the Shopify product image as a protected source asset, not as permission to redraw the product.
- Do not use built-in whole-image edits for catalog-safe products with labels/logos unless the user explicitly approved product re-rendering.
- Prefer deterministic local compositing when label, logo, package text, or exact product geometry matters.
- Generate separate images for distinct concepts rather than asking for many unrelated scenes in one prompt.
- Save final generated images into the workspace. Do not leave project-bound assets only in Codex's default generated-image directory.
- Preserve originals and save generated variants under a campaign-specific folder, such as `exports/generated-product-photos/<campaign>/<product-handle>/`.

## Preview Review

Preview is mandatory. Always present generated product-photo previews to the user before upload, even if the user originally asked to update the store.

Before presenting previews, inspect generated images for:

- one product only
- exact product preservation if using the default workflow
- exact label/logo/package text preservation; no invented, missing, or redesigned readable text
- no invented readable claims
- no distorted flame, cap, package, or product geometry
- product is prominent enough for a Shopify gallery
- scene matches the requested campaign and product context
- aspect ratios are consistent, or user accepted a mix

Hard reject:

- Any changed label layout, logo, brand text, package text, size, claims, product shape, material, or proportions unless the user explicitly approved product re-rendering for that run.
- Any "almost right" product identity. Treat it as failed output, not as an upload candidate with caveats.

Preview manifests must include:

- `productPreservationWorkflow`: `pixel-composite`, `mask-protected-edit`, or `product-rerender-approved`
- `sourceProductPixelsPreserved`: true/false
- `rejectedAttempts`: count and reason summary
- inspection notes comparing the output to the source product

Present the previews and ask which to upload. Upload only after the user approves specific images or clearly approves the full set.

## Upload Generated Images To Shopify

Use Shopify staged uploads, then attach the staged URLs to product media with `productUpdate(media:)`. Do not pass local file paths directly to `productUpdate`.

### 1. Create Staged Uploads

```graphql
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters { name value }
    }
    userErrors { field message }
  }
}
```

Variables:

```json
{
  "input": [
    {
      "filename": "01-seasonal-product-photo.png",
      "mimeType": "image/png",
      "httpMethod": "POST",
      "resource": "IMAGE"
    }
  ]
}
```

Run with `--allow-mutations`.

### 2. POST Image Bytes To Staged Targets

For each staged target:

1. Create multipart form data.
2. Append all returned `parameters`.
3. Append the image file under field name `file`.
4. POST to `stagedTarget.url`.
5. Save `stagedTarget.resourceUrl`; this is the URL used when creating product media.

Node example:

```js
const fs = require("fs");
const path = require("path");

async function uploadToStagedTarget(target, filePath) {
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }

  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: "image/png" });
  form.append("file", blob, path.basename(filePath));

  const response = await fetch(target.url, { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upload failed: ${response.status} ${body.slice(0, 500)}`);
  }
  return target.resourceUrl;
}
```

### 3. Attach Media To Product

Schema can vary by Admin API version. If unsure, introspect mutation fields first. Preferred shape observed with current Shopify Admin API:

```graphql
mutation ProductUpdateMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      handle
      media(first: 20) {
        nodes {
          id
          alt
          mediaContentType
          status
          preview { status image { url altText width height } }
          ... on MediaImage { image { url altText width height } }
        }
      }
    }
    userErrors { field message }
  }
}
```

Variables:

```json
{
  "product": { "id": "gid://shopify/Product/..." },
  "media": [
    {
      "originalSource": "https://shopify-staged-uploads.storage.googleapis.com/tmp/.../image.png",
      "mediaContentType": "IMAGE",
      "alt": "Product name in a seasonal Italian garden lifestyle scene"
    }
  ]
}
```

### 4. Verify Uploads

Run a fresh product media query. Confirm each new media item has:

- `status: READY`
- `preview.status: READY`
- CDN URL populated
- expected width and height
- useful alt text

Save an upload manifest with product ID, product handle, generated local path, Shopify media ID, CDN URL, alt text, status, width, and height.

## Minimal End-To-End Flow

1. Ask for the store address if missing.
2. Install or locate Shopify CLI.
3. Authenticate with `read_products,write_products` if updates are requested.
4. Pull catalog images and create `manifest.json`.
5. Infer product-aware scene concepts from each product's title, image, category, materials, and requested campaign.
6. Generate three product-photo candidates per product using source product images as references/edit targets.
7. Inspect outputs, present previews, and ask which to upload.
8. Create staged uploads for approved images.
9. POST files to staged targets.
10. Attach media with `productUpdate(media:)`.
11. Verify media is `READY`.
12. Save local and upload manifests.

## Final Response Checklist

Tell the user:

- how many products were processed
- how many images were generated
- whether images were preview-only or uploaded
- product handles updated
- local generated-image folder
- upload manifest path
- caveats about label drift, aspect ratio mismatch, or media still processing
