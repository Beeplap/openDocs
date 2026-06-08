import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

export type OutputFormat = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/svg+xml";

export type ConvertFileParams = {
  file: File;
  outputFormat: OutputFormat;
  quality: number;
};

export type ConvertedOutput = {
  blob: Blob;
  outputFormat: OutputFormat;
  pageIndex?: number;
};

export type ConvertFileResult = {
  outputs: ConvertedOutput[];
  outputFormat: OutputFormat;
  warning?: string;
};

export type ConvertImageParams = {
  file: File;
  outputFormat: Exclude<OutputFormat, "application/pdf">;
  quality: number;
};

export type ConvertImageResult = {
  blob: Blob;
  outputFormat: Exclude<OutputFormat, "application/pdf">;
};

const pdfWorkerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

function ensurePdfWorker() {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isHeicLike(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

function isSvgFile(file: File) {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

function supportedImageType(type: string): Exclude<OutputFormat, "application/pdf"> {
  if (type === "image/svg+xml") return "image/svg+xml";
  if (type === "image/png") return "image/png";
  if (type === "image/webp") return "image/webp";
  return "image/jpeg";
}

async function normalizeImageFile(file: File) {
  if (!isHeicLike(file)) {
    return { blob: file as Blob, type: supportedImageType(file.type) };
  }

  const heic2anyModule = await import("heic2any");
  const converted = await heic2anyModule.default({
    blob: file,
    toType: "image/jpeg",
    quality: 0.96,
  });
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(convertedBlob instanceof Blob)) {
    throw new Error("HEIC conversion failed");
  }

  return { blob: convertedBlob, type: "image/jpeg" as const };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function escapeXmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function svgBlobFromDataUrl(dataUrl: string, width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><image href="${escapeXmlAttribute(dataUrl)}" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function minifySvgMarkup(markup: string) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeSvgMarkup(markup: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid SVG");
  }

  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") {
    throw new Error("Invalid SVG root");
  }

  doc.querySelectorAll("script,foreignObject,iframe,object,embed,link,meta").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const isHref = name === "href" || name === "xlink:href";
      const isUnsafeUrl = value.startsWith("javascript:") || value.startsWith("data:text/html");
      const isExternalHref = isHref && /^(https?:)?\/\//.test(value);

      if (name.startsWith("on") || isUnsafeUrl || isExternalHref) {
        node.removeAttribute(attr.name);
      }
    }
  });

  return new XMLSerializer().serializeToString(svg);
}

async function svgFileToSvg(file: File) {
  const source = await file.text();
  return new Blob([minifySvgMarkup(sanitizeSvgMarkup(source))], { type: "image/svg+xml" });
}

function canvasToBlob(canvas: HTMLCanvasElement, outputFormat: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    const encodeQuality = outputFormat === "image/png" || outputFormat === "application/pdf" ? undefined : quality;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode file"));
          return;
        }
        resolve(blob);
      },
      outputFormat === "application/pdf" ? "image/jpeg" : outputFormat,
      encodeQuality
    );
  });
}

async function blobToSvg(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const dataUrl = await readBlobAsDataUrl(blob);
    return svgBlobFromDataUrl(dataUrl, width, height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageFileToSvg(file: File) {
  if (isSvgFile(file)) {
    return svgFileToSvg(file);
  }

  const normalized = await normalizeImageFile(file);
  return blobToSvg(normalized.blob);
}

async function imageFileToCanvas(file: File) {
  const normalized = await normalizeImageFile(file);
  const objectUrl = URL.createObjectURL(normalized.blob);

  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas not supported");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    return { canvas, inputType: normalized.type };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageFileToImage(file: File, outputFormat: Exclude<OutputFormat, "application/pdf">, quality: number) {
  if (outputFormat === "image/svg+xml") {
    const blob = await imageFileToSvg(file);
    return { blob, outputFormat };
  }

  const { canvas } = await imageFileToCanvas(file);
  try {
    const blob = await canvasToBlob(canvas, outputFormat, quality);
    return { blob, outputFormat };
  } finally {
    canvas.remove();
  }
}

async function imageFileToPdf(file: File, quality: number) {
  const { canvas } = await imageFileToCanvas(file);
  try {
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
    const pdfDoc = await PDFDocument.create();
    const image = await pdfDoc.embedJpg(await jpegBlob.arrayBuffer());
    const pageWidth = Math.max(1, canvas.width * 0.75);
    const pageHeight = Math.max(1, canvas.height * 0.75);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const pdfBytes = await pdfDoc.save();
    const copiedBytes = new Uint8Array(pdfBytes.length);
    copiedBytes.set(pdfBytes);
    return new Blob([copiedBytes.buffer], { type: "application/pdf" });
  } finally {
    canvas.remove();
  }
}

function pdfScaleForQuality(quality: number) {
  return Math.max(0.85, Math.min(2.2, 0.65 + quality * 1.45));
}

async function rasterizePdf(
  file: File,
  quality: number,
  outputFormat: Exclude<OutputFormat, "application/pdf">,
  maxPages?: number
) {
  ensurePdfWorker();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const pages: { blob: Blob; widthPt: number; heightPt: number; pageIndex: number }[] = [];
    const pageCount = Math.min(pdf.numPages, maxPages ?? pdf.numPages);
    const scale = pdfScaleForQuality(quality);

    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas not supported");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await canvasToBlob(canvas, outputFormat, quality);
      canvas.remove();

      pages.push({
        blob,
        widthPt: viewport.width / scale,
        heightPt: viewport.height / scale,
        pageIndex,
      });
    }

    return pages;
  } finally {
    await pdf.destroy?.();
  }
}

async function pdfFileToPdf(file: File, quality: number) {
  const pages = await rasterizePdf(file, quality, "image/jpeg");
  const pdfDoc = await PDFDocument.create();

  for (const rasterizedPage of pages) {
    const image = await pdfDoc.embedJpg(await rasterizedPage.blob.arrayBuffer());
    const page = pdfDoc.addPage([rasterizedPage.widthPt, rasterizedPage.heightPt]);
    page.drawImage(image, { x: 0, y: 0, width: rasterizedPage.widthPt, height: rasterizedPage.heightPt });
  }

  const outputBytes = await pdfDoc.save();
  const copiedBytes = new Uint8Array(outputBytes.length);
  copiedBytes.set(outputBytes);
  return new Blob([copiedBytes.buffer], { type: "application/pdf" });
}

export async function convertFile({ file, outputFormat, quality }: ConvertFileParams): Promise<ConvertFileResult> {
  const boundedQuality = Math.max(0.1, Math.min(1, quality));

  if (isPdfFile(file)) {
    if (outputFormat === "image/svg+xml") {
      const pages = await rasterizePdf(file, boundedQuality, "image/png");
      const outputs = await Promise.all(
        pages.map(async (page) => ({
          blob: await blobToSvg(page.blob),
          outputFormat,
          pageIndex: page.pageIndex,
        }))
      );
      return {
        outputs,
        outputFormat,
        warning: "PDF pages are rasterized and embedded inside SVG files, not rebuilt as editable vector artwork.",
      };
    }

    if (outputFormat === "application/pdf") {
      const blob = await pdfFileToPdf(file, boundedQuality);
      const warning =
        blob.size > file.size && boundedQuality >= 0.95
          ? "PDF is already compact. Use a lower quality if you need a smaller file."
          : undefined;
      return { outputs: [{ blob, outputFormat }], outputFormat, warning };
    }

    const pages = await rasterizePdf(file, boundedQuality, outputFormat);
    return {
      outputs: pages.map((page) => ({
        blob: page.blob,
        outputFormat,
        pageIndex: page.pageIndex,
      })),
      outputFormat,
    };
  }

  if (outputFormat === "application/pdf") {
    const blob = await imageFileToPdf(file, boundedQuality);
    return { outputs: [{ blob, outputFormat }], outputFormat };
  }

  const output = await imageFileToImage(file, outputFormat, boundedQuality);
  const warning =
    outputFormat === "image/svg+xml" && !isSvgFile(file)
      ? "Raster images are embedded inside the SVG, not traced into editable vector paths."
      : undefined;
  return { outputs: [output], outputFormat, warning };
}

export async function convertImage({ file, outputFormat, quality }: ConvertImageParams): Promise<ConvertImageResult> {
  const result = await convertFile({ file, outputFormat, quality });
  const firstOutput = result.outputs[0];
  if (!firstOutput || firstOutput.outputFormat === "application/pdf") {
    throw new Error("Image conversion failed");
  }
  return { blob: firstOutput.blob, outputFormat: firstOutput.outputFormat };
}
