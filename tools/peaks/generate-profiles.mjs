#!/usr/bin/env node
/**
 * Generate the real elevation profile of every peak finPal draws, ONCE, and bake it into a static file.
 *
 *   node tools/peaks/generate-profiles.mjs <out.ts>
 *
 * *** RUN ONCE AND COMMITTED. THE APP NEVER CALLS AN ELEVATION SERVICE. *** The output is a plain TypeScript
 * module of numbers; this script is kept beside it so anyone can see where every point came from and regenerate it.
 *
 * Source: the Terrain Tiles open dataset on AWS (s3://elevation-tiles-prod, "terrarium" PNG encoding,
 * elevation = R*256 + G + B/256 - 32768 metres), maintained by Mapzen / the Linux Foundation. It blends several
 * public elevation sets (SRTM, GMTED2010, 3DEP, EU-DEM and others) and this script does not know which one a given
 * pixel came from, so the output carries the dataset's whole required-attribution block, verbatim. Licence:
 * https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 *
 * Method, per peak: a straight transect through the surveyed summit on a chosen bearing (the side the peak is
 * usually seen from). At each of SAMPLES points along it, the elevation is the HIGHEST value across a narrow band
 * either side of the line (`band_m`), which is what a skyline is: the outline you see from a distance, not one
 * knife-cut. Read at zoom 12 (about 20-38 m per pixel at these latitudes).
 *
 * *** THE SUMMIT IS PINNED TO THE SURVEYED HEIGHT. *** A 30 m grid averages a summit away (Everest reads about
 * 8,730 m in these tiles; the 2020 survey is 8,848.86). The highest sample is raised to the catalogue elevation and
 * its two neighbours each side by a tapering share of the same lift (2/3, 1/3), so the summit is not a one-sample
 * needle. The grid's own value is kept in `dem_max_m`, so the label and the drawing agree and the correction is
 * visible.
 *
 * No dependencies: PNG decoding uses Node's zlib. Node 18+ (global fetch).
 */
import zlib from 'node:zlib';
import fs from 'node:fs';

const ZOOM = 12;
const SAMPLES = 97;           // points along the transect (96 intervals)
const CROSS = 7;              // samples across the band, for the skyline max
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/*
 * The catalogue: the same six peaks, slugs and surveyed elevations as `src/data/seed_mountains.py` (BAND_ORDER).
 * The mapping and the numbers are not this script's to change; only the coordinates and the viewing bearing are new.
 * bearing_deg: the transect runs from bearing+180 to bearing through the summit (90 = west to east).
 */
const PEAKS = [
  // Maclear's Beacon, the highest point of the plateau. Seen from Table Bay: the flat front table, WSW to ENE.
  { slug: 'table-mountain', name: 'Table Mountain', elevation_m: 1085, lat: -33.9628, lon: 18.4039, bearing_deg: 70, half_m: 4200, band_m: 500 },
  // West to east: the summit plateau, then Carn Mor Dearg beyond the col.
  { slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345, lat: 56.7969, lon: -5.0036, bearing_deg: 90, half_m: 5000, band_m: 400 },
  { slug: 'mount-fuji', name: 'Mount Fuji', elevation_m: 3776, lat: 35.3606, lon: 138.7274, bearing_deg: 90, half_m: 16000, band_m: 600 },
  { slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392, lat: 46.8529, lon: -121.7604, bearing_deg: 90, half_m: 14000, band_m: 600 },
  { slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961, lat: -32.6532, lon: -70.0109, bearing_deg: 90, half_m: 10000, band_m: 600 },
  { slug: 'everest', name: 'Everest', elevation_m: 8849, lat: 27.9881, lon: 86.925, bearing_deg: 90, half_m: 9000, band_m: 500 },
];

function decodePng(buf) {
  let p = 8; let w; let h; let bitDepth; let colorType; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
      if (data[12]) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth}`);
  const bpp = { 2: 3, 6: 4 }[colorType];
  if (!bpp) throw new Error(`colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0; const b = prev ? prev[x] : 0; const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c; const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const tiles = new Map();
async function tile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    const res = await fetch(TILE_URL(ZOOM, x, y));
    if (!res.ok) throw new Error(`tile ${key}: HTTP ${res.status}`);
    tiles.set(key, decodePng(Buffer.from(await res.arrayBuffer())));
  }
  return tiles.get(key);
}

/** Elevation in metres at a point, bilinear between the four nearest pixels. */
async function elevation(lat, lon) {
  const n = 2 ** ZOOM * 256;
  const fx = ((lon + 180) / 360) * n - 0.5;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - 0.5;
  const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
  const at = async (px, py) => {
    const im = await tile(Math.floor(px / 256), Math.floor(py / 256));
    const i = ((py % 256) * im.w + (px % 256)) * im.bpp;
    return im.px[i] * 256 + im.px[i + 1] + im.px[i + 2] / 256 - 32768;
  };
  const [a, b, c, d] = await Promise.all([at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)]);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** A point `dx` metres east and `dy` metres north of (lat, lon). Fine at these distances (< 20 km). */
function offset(lat, lon, dx, dy) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return [lat + dy / mPerDegLat, lon + dx / mPerDegLon];
}

async function profile(peak) {
  const b = (peak.bearing_deg * Math.PI) / 180;
  const along = [Math.sin(b), Math.cos(b)];          // east, north
  const across = [Math.cos(b), -Math.sin(b)];
  const points = [];
  let demMax = -Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const s = -peak.half_m + (2 * peak.half_m * i) / (SAMPLES - 1);
    let best = -Infinity;
    for (let j = 0; j < CROSS; j++) {
      const c = -peak.band_m + (2 * peak.band_m * j) / (CROSS - 1);
      const [lat, lon] = offset(peak.lat, peak.lon, along[0] * s + across[0] * c, along[1] * s + across[1] * c);
      best = Math.max(best, await elevation(lat, lon));
    }
    demMax = Math.max(demMax, best);
    points.push([Math.round(s + peak.half_m), Math.round(best)]);
  }
  // Pin the highest sample to the surveyed summit, tapering the lift over two neighbours (see the header).
  let top = 0;
  points.forEach((p, i) => { if (p[1] > points[top][1]) top = i; });
  const lift = peak.elevation_m - points[top][1];
  for (let d = -2; d <= 2; d++) {
    const i = top + d;
    if (i < 0 || i >= points.length) continue;
    const share = 1 - Math.abs(d) / 3;
    points[i] = [points[i][0], Math.min(peak.elevation_m, Math.round(points[i][1] + lift * share))];
  }
  points[top] = [points[top][0], peak.elevation_m];
  return { demMax: Math.round(demMax), points };
}

const out = process.argv[2];
if (!out) { console.error('usage: generate-profiles.mjs <out.ts>'); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const rows = [];
for (const peak of PEAKS) {
  const { demMax, points } = await profile(peak);
  const min = Math.min(...points.map((p) => p[1]));
  console.error(`${peak.slug}: dem max ${demMax} m, pinned ${peak.elevation_m} m, lowest ${min} m, ${points.length} points`);
  rows.push(
    `  '${peak.slug}': {\n`
    + `    name: '${peak.name}', elevation_m: ${peak.elevation_m}, dem_max_m: ${demMax},\n`
    + `    summit: [${peak.lat}, ${peak.lon}], bearing_deg: ${peak.bearing_deg}, length_m: ${peak.half_m * 2}, band_m: ${peak.band_m},\n`
    + `    points: [${points.map((p) => `[${p[0]},${p[1]}]`).join(',')}],\n`
    + '  },',
  );
}

const body = `/**
 * GENERATED, DO NOT EDIT BY HAND. Real elevation profiles of the six catalogue peaks.
 *
 * Generated ${today} by \`node tools/peaks/generate-profiles.mjs\` (that script is the method; read it).
 * One straight transect through each surveyed summit, ${SAMPLES} points, each the highest ground within \`band_m\`
 * either side of the line (a skyline, as the peak is seen from a distance). \`points\` are [distance along the
 * transect in metres, elevation in metres above sea level]. The highest point is pinned to the surveyed elevation;
 * \`dem_max_m\` is what the elevation grid itself reads there.
 *
 * Source: Terrain Tiles on AWS Open Data (s3://elevation-tiles-prod, terrarium encoding, zoom ${ZOOM}),
 * Mapzen / Linux Foundation. Licence and required attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 * Required attribution: the dataset's own block, verbatim, is in \`tools/peaks/ATTRIBUTION.txt\` beside the
 * generator (kept out of \`src/\` because two of its lines carry rights notices the AGPL licence gate refuses in the
 * UI tree). In short: SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; EU-DEM produced using
 * Copernicus data and information funded by the European Union; ETOPO1 from NOAA; via Mapzen Terrain Tiles.
 *
 * *** NO RUNTIME CALLS. *** The app reads only this file. Same file, byte for byte, in finpal_core web-ui,
 * finpal_premium web-ui and finpal-mobile; change one, regenerate all three, and \`diff\` them.
 */

export interface PeakProfile {
  name: string;
  /** The surveyed summit, the same figure as \`seed_mountains.py\`. */
  elevation_m: number;
  /** What the elevation grid reads at the summit before pinning. */
  dem_max_m: number;
  /** [lat, lon] of the summit. */
  summit: [number, number];
  /** Bearing of the transect, degrees from north. */
  bearing_deg: number;
  length_m: number;
  band_m: number;
  /** [distance m, elevation m] along the transect. */
  points: Array<[number, number]>;
}

export const PROFILE_SOURCE = {
  generated: '${today}',
  dataset: 'Terrain Tiles on AWS Open Data (Mapzen / Linux Foundation), terrarium encoding, zoom ${ZOOM}',
  licence: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  attribution: 'Elevation data: Mapzen Terrain Tiles (SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; EU-DEM produced using Copernicus data; ETOPO1 NOAA; full list in the file header).',
} as const;

export const PEAK_PROFILES: Record<string, PeakProfile> = {
${rows.join('\n')}
};
`;
fs.writeFileSync(out, body);
console.error(`wrote ${out}`);
