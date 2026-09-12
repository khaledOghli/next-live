/**
 * Generates favicons, PWA icons, and WebP brand assets for the playground app.
 * Source files live in the repo-root `assets/` folder.
 *
 * Run: npm run generate:brand -w playground
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playgroundRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(playgroundRoot, '../..');
const assetsRoot = path.join(repoRoot, 'assets');
const publicBrand = path.join(playgroundRoot, 'public/brand');
const appDir = path.join(playgroundRoot, 'app');

const faviconSrc = path.join(assetsRoot, 'nextlive-favicon.png');
const wordmarkSrc = path.join(assetsRoot, 'next-live-white.png');

/**
 * Packs PNG buffers into an ICO container.
 *
 * Inline rather than via `to-ico`, which pulls in `jimp@0.2.28` -> `request`
 * and with it five critical advisories, for 40 lines of byte packing. The
 * format is an 6-byte header, one 16-byte directory entry per image, then the
 * image payloads; every browser and Windows since Vista reads PNG payloads, so
 * sharp's output goes in untouched.
 */
function packIco(images) {
  const HEADER = 6;
  const ENTRY = 16;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;

  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ENTRY);
    // 256 is encoded as 0; nothing here is that large, but the rule is the rule.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette colors: none, it is truecolor
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function squareIcon(input, size, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  return sharp(input)
    .trim({ threshold: 10 })
    .resize(size, size, {
      fit: 'contain',
      background,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeWebp(input, output, width) {
  let pipeline = sharp(input).trim({ threshold: 10 });
  if (width) pipeline = pipeline.resize(width);
  await pipeline.webp({ quality: 90, effort: 6 }).toFile(output);
}

async function main() {
  await mkdir(publicBrand, { recursive: true });

  const [icon16, icon32, icon48, icon180, icon512] = await Promise.all([
    squareIcon(faviconSrc, 16),
    squareIcon(faviconSrc, 32),
    squareIcon(faviconSrc, 48),
    squareIcon(faviconSrc, 180),
    squareIcon(faviconSrc, 512),
  ]);

  await writeFile(
    path.join(appDir, 'favicon.ico'),
    packIco([
      { size: 16, data: icon16 },
      { size: 32, data: icon32 },
      { size: 48, data: icon48 },
    ]),
  );
  await writeFile(path.join(appDir, 'icon.png'), icon512);
  await writeFile(path.join(appDir, 'apple-icon.png'), icon180);

  await Promise.all([
    sharp(wordmarkSrc)
      .trim({ threshold: 10 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(publicBrand, 'next-live-white.png')),
    writeWebp(wordmarkSrc, path.join(publicBrand, 'next-live-white.webp'), 780),
    sharp(faviconSrc)
      .trim({ threshold: 10 })
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(publicBrand, 'nextlive-icon.png')),
    squareIcon(faviconSrc, 512).then((buffer) =>
      sharp(buffer).webp({ quality: 90, effort: 6 }).toFile(path.join(publicBrand, 'nextlive-icon.webp')),
    ),
  ]);

  const manifest = {
    name: 'next-live',
    short_name: 'next-live',
    description: 'Live TSX evaluation for the Next.js App Router.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#7c3aed',
    icons: [
      { src: '/brand/nextlive-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/nextlive-icon.webp', sizes: '512x512', type: 'image/webp', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };

  await writeFile(
    path.join(playgroundRoot, 'public/site.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log('Brand assets generated.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
