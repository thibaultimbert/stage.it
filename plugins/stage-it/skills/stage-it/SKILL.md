---
name: stage-it
description: Use when a user wants Codex to connect to any Shopify store, extract product catalog images, generate new AI product photography with gpt-image-2 from the actual product images, preview the results, and upload approved or explicitly requested images back to Shopify product listings.
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
2. Resolve the permanent `.myshopify.com` domain before authenticating.
3. Authenticate to the resolved store with the required Admin API scopes.
4. Pull product media and create a local catalog manifest.
5. Generate new product photography with `gpt-image-2` image-to-image by passing each product's real image as the reference/edit target alongside the scene prompt.
6. Always show generated previews and wait for approval before uploading.
7. After approval, upload acceptable generated images as additional Shopify product media.
8. Verify uploaded media is `READY` and save an upload manifest.

Safety defaults:

- Never delete or replace existing product media unless explicitly requested.
- Add generated images as additional media by default.
- Never upload generated images without first presenting previews for user approval.
- Always use `gpt-image-2` image-to-image for product-photo generation: provide the original Shopify product image as the input image/reference/edit target and put the scene request in the prompt.
- Do not use another image model unless the user explicitly approves a fallback. If `gpt-image-2` cannot be selected or is unavailable, stop and explain the blocker.
- Do not crop, cut out, mask, paste, manually composite, or build the final product photo by placing product pixels into a generated background unless the user explicitly asks for that non-default workflow.
- Never present an image with a changed label, logo, invented readable text, altered package shape, or altered product proportions as an upload candidate. Mark it failed and rerun with the same canonical prompt pattern and a simpler environment.
- If repeated GPT image-to-image attempts cannot preserve the product identity well enough, stop and explain the limitation.
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
- Resolve the permanent `.myshopify.com` domain before running `shopify store auth`.
- Fetch `https://<normalized-store-host>/meta.json` and parse `myshopify_domain`; use that value as `<store.myshopify.com>` for all Shopify CLI commands.
- Do not authenticate against the user-facing alias if `meta.json` returns a different `myshopify_domain`. Shopify OAuth callbacks can fail on first run with `OAuth callback store does not match the requested store` when auth starts from the alias.
- If `meta.json` is unavailable and the normalized host already ends in `.myshopify.com`, use that host. If it is a custom domain and `meta.json` does not return `myshopify_domain`, ask the user for their `.myshopify.com` domain before authenticating.
- If `shopify store auth` still reports a callback store mismatch, resolve `meta.json` again and rerun auth once with the returned `myshopify_domain`; only then ask the user for the permanent domain.

One-shot resolver:

```bash
node -e 'const raw=process.argv[1]; const host=raw.replace(/^https?:\/\//,"").replace(/\/.*$/,"").trim(); fetch(`https://${host}/meta.json`).then(r=>r.ok?r.json():Promise.reject(new Error(`${r.status} ${r.statusText}`))).then(j=>console.log(j.myshopify_domain || host)).catch(()=>console.log(host));' "<store-url-or-host>"
```

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
4. Keep a generation manifest mapping product ID, handle, source media ID, source image path, image model (`gpt-image-2`), prompt, generated paths, and eventual Shopify media IDs.

## Product Photography Generation

Core rule: attach the product image and keep the prompt simple.

Use `gpt-image-2` image-to-image with the original Shopify product image supplied as the input image/reference/edit target. The prompt must describe only where to place the attached reference product. Do not describe the product, label, logo, readable text, packaging, or product state from prose.

Canonical prompt pattern:

```text
Place the reference product attached in <environment>.
```

Examples:

```text
Place the reference product attached in a serene Mediterranean bathroom vanity scene with pale stone, eucalyptus, folded white linen, a small ceramic dish, soft morning window light, and warm neutral shadows.
```

```text
Place the reference product attached in a bright early-summer Italian lemon grove breakfast table scene with sunlit stone, fresh lemons, olive leaves, pale linen, and soft Mediterranean morning light.
```

Prompt rules:

- Use the canonical pattern exactly.
- Fill `<environment>` with one concise scene. The environment may include setting, season, props, lighting, and mood.
- Do not include product names, brand names, logo descriptions, label text, typography instructions, package text, "preserve" checklists, or negative prompt lists.
- Do not ask for product state changes unless the user explicitly requested them. Let the attached reference image define the product state.
- Generate separate images by changing only `<environment>`.

Tool guidance:

- Use Codex's native GPT image capability for generation and editing, and select model `gpt-image-2` explicitly wherever model selection is available.
- If `gpt-image-2` is unavailable, stop and ask the user before using any other image model.
- Treat the Shopify product image as the input image reference/edit target.
- Do not crop, cut out, mask, paste, manually composite, or use local image processing to assemble the product photo unless the user explicitly requests that separate workflow.
- Do not propose exact-product compositing as the default fallback. If `gpt-image-2` drifts, retry with the same canonical prompt pattern and a simpler environment. If repeated attempts fail, report the failure and ask whether the user wants to try a different source image, a simpler environment, or an explicitly approved non-default workflow.
- Generate separate images for distinct concepts rather than asking for many unrelated scenes in one prompt.
- Save final generated images into the workspace. Do not leave project-bound assets only in Codex's default generated-image directory.
- Preserve originals and save generated variants under a campaign-specific folder, such as `exports/generated-product-photos/<campaign>/<product-handle>/`.

## Preview Review

Preview is mandatory. Always present generated product-photo previews to the user before upload, even if the user originally asked to update the store.

Before presenting previews, inspect generated images for:

- one product only
- logo visually matches the source image; no swapped mark, redesigned symbol, missing mark, or inconsistent logo geometry
- exact visible label layout/package text preservation; no invented, missing, or redesigned readable text
- no invented readable claims
- no distorted flame, cap, package, or product geometry
- product is prominent enough for a Shopify gallery
- scene matches the requested campaign and product context
- aspect ratios are consistent, or user accepted a mix

Hard reject:

- Any changed label layout, logo, brand text, package text, size, claims, product shape, material, or proportions.
- Any "almost right" product identity. Treat it as failed output, not as an upload candidate with caveats.

Preview manifests must include:

- `imageModel`: `gpt-image-2`
- `productPreservationWorkflow`: `gpt-image-to-image`
- `sourceImageUsedAsReference`: true/false
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
3. Resolve the permanent `.myshopify.com` domain with `/meta.json`.
4. Authenticate with `read_products,write_products` if updates are requested.
5. Pull catalog images and create `manifest.json`.
6. Infer product-aware scene concepts from each product's title, image, category, materials, and requested campaign.
7. Generate three product-photo candidates per product with `gpt-image-2`, the source product image attached, and the canonical prompt pattern.
8. Inspect outputs, present previews, and ask which to upload.
9. Create staged uploads for approved images.
10. POST files to staged targets.
11. Attach media with `productUpdate(media:)`.
12. Verify media is `READY`.
13. Save local and upload manifests.

## Final Response Checklist

Tell the user:

- how many products were processed
- how many images were generated
- whether images were preview-only or uploaded
- product handles updated
- local generated-image folder
- upload manifest path
- caveats about label drift, aspect ratio mismatch, or media still processing
