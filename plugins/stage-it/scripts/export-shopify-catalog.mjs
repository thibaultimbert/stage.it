import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const providedStore = process.argv[2];
const outDir = process.argv[3] || "exports/shopify-catalog-images";
const shopifyBin = process.env.SHOPIFY_BIN || "/Users/thibault/.npm-global/bin/shopify";

if (!providedStore) {
  console.error("Usage: node scripts/export-shopify-catalog.mjs <store.myshopify.com> [outDir]");
  process.exit(1);
}

const query = `query CatalogImages($after: String) {
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
}`;

function parseCliJson(output) {
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Could not find JSON object in Shopify CLI output:\n${output}`);
  }
  return JSON.parse(output.slice(firstBrace, lastBrace + 1));
}

function extensionFor(url, contentType) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  if (ext) return ext;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("webp")) return ".webp";
  return ".img";
}

function sanitize(value) {
  return String(value || "image")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function normalizeStoreHost(value) {
  return String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

async function resolvePermanentStoreDomain(value) {
  const host = normalizeStoreHost(value);
  if (!host) return host;

  try {
    const response = await fetch(`https://${host}/meta.json`);
    if (!response.ok) return host;
    const metadata = await response.json();
    return normalizeStoreHost(metadata.myshopify_domain || host);
  } catch {
    return host;
  }
}

const store = await resolvePermanentStoreDomain(providedStore);

const result = spawnSync(
  shopifyBin,
  ["store", "execute", "--store", store, "--json", "--query", query],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status || 1);
}

const catalog = parseCliJson(`${result.stdout}\n${result.stderr}`);
const products = catalog.products?.nodes || [];
const imageDir = path.join(outDir, "images");
await mkdir(imageDir, { recursive: true });
await writeFile(path.join(outDir, "catalog-media.json"), `${JSON.stringify(catalog, null, 2)}\n`);

const images = [];
for (const product of products) {
  const mediaNodes = product.media?.nodes || [];
  for (const media of mediaNodes) {
    if (media.mediaContentType !== "IMAGE") continue;
    const image = media.image || media.preview?.image;
    if (!image?.url) continue;

    const mediaIdTail = media.id?.split("/").pop() || images.length + 1;
    const response = await fetch(image.url);
    if (!response.ok) {
      throw new Error(`Failed to download ${image.url}: ${response.status} ${await response.text()}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const ext = extensionFor(image.url, contentType);
    const filename = `${String(images.length + 1).padStart(3, "0")}-${sanitize(product.handle)}-${mediaIdTail}${ext}`;
    const localPath = path.join(imageDir, filename);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, bytes);

    images.push({
      productId: product.id,
      productLegacyResourceId: product.legacyResourceId,
      productTitle: product.title,
      productHandle: product.handle,
      productStatus: product.status,
      mediaId: media.id,
      mediaAlt: media.alt || image.altText || "",
      width: image.width,
      height: image.height,
      sourceUrl: image.url,
      localPath,
      filename,
      bytes: bytes.length,
    });
  }
}

const manifest = {
  store,
  providedStore: normalizeStoreHost(providedStore),
  exportedAt: new Date().toISOString(),
  productCount: products.length,
  imageCount: images.length,
  images,
};

await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ productCount: products.length, imageCount: images.length, outDir }, null, 2));
