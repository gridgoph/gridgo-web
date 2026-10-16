#!/usr/bin/env node
/**
 * Draws the supplier web app's icons from the GRIDGO 3×3 mark, with the
 * `sharp` that Next installs for image optimisation.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * Colours are the shipped favicon's (`src/app/icon.png`): ink tile, white
 * dots, the yellow top-right dot and the two grey dots below it. The mark
 * fills 42% of the tile, as the favicon does, which also keeps it inside the
 * maskable safe zone (a circle of 40% radius), so a launcher that crops the
 * tile to a circle or squircle never clips a dot. That is why the manifest
 * lists the same two files as both `any` and `maskable`.
 *
 * The badge is the mark alone in white on transparent: Android draws it in
 * the status bar as a silhouette, so colour would be thrown away.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "pwa");

const TILE = "#111111";
const DOT = "#ffffff";
const YELLOW = "#ffde58";
const GREY = "#8a8a8a";

/** The mark on a 48-unit grid, as `src/components/ui/Logo.tsx` draws it. */
function dots({ ink, yellow, grey }) {
  const at = [8, 24, 40];
  const circles = [];
  for (const cy of at) {
    for (const cx of at) {
      let fill = ink;
      if (cx === 40 && cy === 8) fill = yellow;
      else if (cx === 40) fill = grey;
      circles.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${fill}"/>`);
    }
  }
  return circles.join("");
}

function tileSvg(size, markShare) {
  const mark = size * markShare;
  const offset = (size - mark) / 2;
  const scale = mark / 46; // dots span 3..45 on the 48 grid
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${TILE}"/>
  <g transform="translate(${offset - 3 * scale} ${offset - 3 * scale}) scale(${scale})">${dots({ ink: DOT, yellow: YELLOW, grey: GREY })}</g>
</svg>`;
}

function badgeSvg(size) {
  const mark = size * 0.72;
  const offset = (size - mark) / 2;
  const scale = mark / 46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${offset - 3 * scale} ${offset - 3 * scale}) scale(${scale})">${dots({ ink: DOT, yellow: DOT, grey: DOT })}</g>
</svg>`;
}

const icons = [
  { file: "icon-192.png", svg: tileSvg(192, 0.42) },
  { file: "icon-512.png", svg: tileSvg(512, 0.42) },
  // iOS rounds the corners itself and ignores transparency.
  { file: "apple-touch-icon.png", svg: tileSvg(180, 0.46) },
  { file: "badge-96.png", svg: badgeSvg(96) },
];

await mkdir(out, { recursive: true });
for (const icon of icons) {
  await sharp(Buffer.from(icon.svg))
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, icon.file));
  console.log(`public/pwa/${icon.file}`);
}
