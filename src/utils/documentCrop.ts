import type { CropPoint, DocumentCrop } from "../components/scanner/types";

type ImageSize = { w: number; h: number };

const DEFAULT_OUTPUT_LONG_EDGE = 1800;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function distance(a: CropPoint, b: CropPoint, size: ImageSize) {
  return Math.hypot((a.x - b.x) * size.w, (a.y - b.y) * size.h);
}

function bilinearPoint(points: DocumentCrop["points"], u: number, v: number) {
  const [tl, tr, br, bl] = points;
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const bottomX = bl.x + (br.x - bl.x) * u;
  const bottomY = bl.y + (br.y - bl.y) * u;

  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

function readBilinear(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;
  const top = source[i00] + (source[i10] - source[i00]) * tx;
  const bottom = source[i01] + (source[i11] - source[i01]) * tx;
  return top + (bottom - top) * ty;
}

export function defaultDocumentCrop(): DocumentCrop {
  return {
    points: [
      { x: 0.08, y: 0.08 },
      { x: 0.92, y: 0.08 },
      { x: 0.92, y: 0.92 },
      { x: 0.08, y: 0.92 },
    ],
  };
}

export function normalizeDocumentCrop(crop: DocumentCrop): DocumentCrop {
  return {
    points: crop.points.map((point) => ({
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    })) as DocumentCrop["points"],
  };
}

export function estimateDocumentCrop(imageData: ImageData): DocumentCrop {
  const { width, height, data } = imageData;
  const step = Math.max(2, Math.floor(Math.max(width, height) / 420));
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const alpha = data[i + 3];
      if (alpha < 20 || luminance < 168) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const foundArea = (maxX - minX) * (maxY - minY);
  const imageArea = width * height;
  if (foundArea < imageArea * 0.16 || minX >= maxX || minY >= maxY) {
    return defaultDocumentCrop();
  }

  const padX = width * 0.015;
  const padY = height * 0.015;
  return normalizeDocumentCrop({
    points: [
      { x: (minX - padX) / width, y: (minY - padY) / height },
      { x: (maxX + padX) / width, y: (minY - padY) / height },
      { x: (maxX + padX) / width, y: (maxY + padY) / height },
      { x: (minX - padX) / width, y: (maxY + padY) / height },
    ],
  });
}

export async function detectDocumentCrop(image: HTMLImageElement): Promise<DocumentCrop> {
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return defaultDocumentCrop();

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.remove();
  return estimateDocumentCrop(imageData);
}

export async function cropImageWithDocumentCrop(
  image: HTMLImageElement,
  crop: DocumentCrop,
  outputLongEdge = DEFAULT_OUTPUT_LONG_EDGE
): Promise<HTMLCanvasElement> {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  const size = { w: naturalW, h: naturalH };
  const normalized = normalizeDocumentCrop(crop);
  const [tl, tr, br, bl] = normalized.points;
  const top = distance(tl, tr, size);
  const bottom = distance(bl, br, size);
  const left = distance(tl, bl, size);
  const right = distance(tr, br, size);
  const targetRatio = Math.max(0.2, ((top + bottom) / 2) / Math.max(1, (left + right) / 2));

  let outputW: number;
  let outputH: number;
  if (targetRatio >= 1) {
    outputW = outputLongEdge;
    outputH = Math.max(1, Math.round(outputLongEdge / targetRatio));
  } else {
    outputH = outputLongEdge;
    outputW = Math.max(1, Math.round(outputLongEdge * targetRatio));
  }

  const output = document.createElement("canvas");
  output.width = outputW;
  output.height = outputH;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = naturalW;
  sourceCanvas.height = naturalH;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) throw new Error("Canvas not supported");
  sourceCtx.drawImage(image, 0, 0, naturalW, naturalH);
  const source = sourceCtx.getImageData(0, 0, naturalW, naturalH).data;
  const out = ctx.createImageData(outputW, outputH);
  const dst = out.data;

  for (let y = 0; y < outputH; y += 1) {
    const v = outputH === 1 ? 0 : y / (outputH - 1);
    for (let x = 0; x < outputW; x += 1) {
      const u = outputW === 1 ? 0 : x / (outputW - 1);
      const point = bilinearPoint(normalized.points, u, v);
      const sx = clamp(point.x * (naturalW - 1), 0, naturalW - 1);
      const sy = clamp(point.y * (naturalH - 1), 0, naturalH - 1);
      const dstIndex = (y * outputW + x) * 4;
      dst[dstIndex] = readBilinear(source, naturalW, naturalH, sx, sy, 0);
      dst[dstIndex + 1] = readBilinear(source, naturalW, naturalH, sx, sy, 1);
      dst[dstIndex + 2] = readBilinear(source, naturalW, naturalH, sx, sy, 2);
      dst[dstIndex + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  sourceCanvas.remove();
  return output;
}
