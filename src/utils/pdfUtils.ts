/**
 * Utility functions for converting between image blobs and PDF documents.
 */

import { PDFDocument, rgb, degrees, StandardFonts, PDFFont } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AdvancedAnnotation, PageCrop } from "../components/scanner/types";

const pdfWorkerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
const CSS_PIXEL_TO_POINT = 0.75;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function ensurePdfWorker() {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdf = await PDFDocument.load(await file.arrayBuffer());
  return pdf.getPageCount();
}

export async function getPdfFirstPagePreview(file: File): Promise<Blob> {
  ensurePdfWorker();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.8 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Failed to render PDF preview"));
          return;
        }
        resolve(value);
      }, "image/png")
    );
    canvas.remove();
    return blob;
  } finally {
    await pdf.destroy?.();
  }
}

export async function mergePdfFiles(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return mergedPdf.save();
}

export async function imagesToPDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (const blob of images) {
    const arrayBuffer = await blob.arrayBuffer();
    const type = blob.type;
    const embedded = type === "image/png"
      ? await pdfDoc.embedPng(arrayBuffer)
      : await pdfDoc.embedJpg(arrayBuffer);
    const { width, height } = embedded.scale(1);
    const pageWidth = Math.max(1, width * CSS_PIXEL_TO_POINT);
    const pageHeight = Math.max(1, height * CSS_PIXEL_TO_POINT);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const maxW = pageWidth * 0.94;
    const maxH = pageHeight * 0.94;
    const scale = Math.min(maxW / width, maxH / height);
    const w = width * scale;
    const h = height * scale;
    const x = (pageWidth - w) / 2;
    const y = (pageHeight - h) / 2;
    page.drawImage(embedded, { x, y, width: w, height: h });
  }
  return pdfDoc.save();
}

export async function imagesToFullPageA4PDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const blob of images) {
    const arrayBuffer = await blob.arrayBuffer();
    const embedded = blob.type === "image/png"
      ? await pdfDoc.embedPng(arrayBuffer)
      : await pdfDoc.embedJpg(arrayBuffer);
    const { width, height } = embedded.scale(1);
    const pageWidth = Math.max(1, width * CSS_PIXEL_TO_POINT);
    const pageHeight = Math.max(1, height * CSS_PIXEL_TO_POINT);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }

  return pdfDoc.save();
}

export async function imagesToA4TwoUpPDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const margin = 30;
  const gap = 12;
  const contentW = A4_WIDTH - margin * 2;
  const contentH = A4_HEIGHT - margin * 2;
  const halfH = (contentH - gap) / 2;

  for (let i = 0; i < images.length; i += 2) {
    const topBlob = images[i];
    const bottomBlob = images[i + 1];

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    if (topBlob) {
      const arrayBuffer = await topBlob.arrayBuffer();
      const type = topBlob.type;
      const embedded =
        type === "image/png" ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
      const { width, height } = embedded.scale(1);

      const scale = Math.min(1, contentW / width, halfH / height);
      const w = width * scale;
      const h = height * scale;
      const x = margin + (contentW - w) / 2;
      const y = margin + halfH + gap + (halfH - h) / 2; // PDF origin is bottom-left

      page.drawImage(embedded, { x, y, width: w, height: h });
    }

    if (bottomBlob) {
      const arrayBuffer = await bottomBlob.arrayBuffer();
      const type = bottomBlob.type;
      const embedded =
        type === "image/png" ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
      const { width, height } = embedded.scale(1);

      const scale = Math.min(1, contentW / width, halfH / height);
      const w = width * scale;
      const h = height * scale;
      const x = margin + (contentW - w) / 2;
      const y = margin + (halfH - h) / 2;

      page.drawImage(embedded, { x, y, width: w, height: h });
    }
  }

  return pdfDoc.save();
}

export async function pdfToImages(file: File): Promise<Blob[]> {
  ensurePdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;
  const result: Blob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Failed to convert canvas to blob"));
          return;
        }
        resolve(value);
      }, "image/png")
    );
    result.push(blob);
    canvas.remove();
  }
  return result;
}

export async function renderPdfPageToCanvas(
  file: File,
  pageIndex: number,
  scale = 1.5
): Promise<HTMLCanvasElement> {
  ensurePdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally {
    await pdf.destroy?.();
  }
}

export interface PdfPageMetadata {
  originalPageIndex: number;
  width: number;
  height: number;
}

export async function loadPdfDocumentAndMetadata(
  file: File,
  scale = 2.0,
  password?: string
): Promise<{ pdfDocument: PDFDocumentProxy; pages: PdfPageMetadata[] }> {
  ensurePdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    password,
    isOffscreenCanvasSupported: false,
  });
  const pdf = (await loadingTask.promise) as unknown as PDFDocumentProxy;
  const pages: PdfPageMetadata[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    pages.push({
      originalPageIndex: i - 1, // 0-indexed internally
      width: viewport.width,
      height: viewport.height,
    });
  }
  
  return { pdfDocument: pdf, pages };
}

export async function buildAnnotatedPdf(pageCanvases: HTMLCanvasElement[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (const canvas of pageCanvases) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const embedded = await pdfDoc.embedJpg(bytes);
    const pageWidth = Math.max(1, canvas.width * CSS_PIXEL_TO_POINT);
    const pageHeight = Math.max(1, canvas.height * CSS_PIXEL_TO_POINT);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }
  return pdfDoc.save();
}

export type PageDataExport = {
  originalPageIndex?: number;
  rotation: number;
  width: number;
  height: number;
  crop?: PageCrop | null;
  canvas?: HTMLCanvasElement;
};

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return rgb(0, 0, 0);
  return rgb(
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  );
}

function wrapPdfText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(nextLine, fontSize);
      if (width <= maxWidth || !line) {
        line = nextLine;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildAnnotatedPdfFromSource(
  sourcePdfBytes: Uint8Array,
  pages: PageDataExport[],
  annotations: AdvancedAnnotation[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourcePdfBytes);
  const outPdf = await PDFDocument.create();

  const fontRegular = await outPdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await outPdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await outPdf.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await outPdf.embedFont(StandardFonts.HelveticaBoldOblique);

  const indicesToCopy = pages
    .filter(p => p.originalPageIndex !== undefined && p.originalPageIndex >= 0 && p.originalPageIndex < sourcePdf.getPageCount())
    .map(p => p.originalPageIndex as number);
  
  const copiedSourcePages = indicesToCopy.length > 0 
    ? await outPdf.copyPages(sourcePdf, indicesToCopy) 
    : [];
    
  let copiedIndex = 0;

  for (let i = 0; i < pages.length; i++) {
    const pgData = pages[i];
    const pageAnns = annotations.filter(a => a.pageIndex === i);
    
    let outPage;
    let pw = 0;
    let ph = 0;

    if (pgData.originalPageIndex !== undefined && pgData.originalPageIndex >= 0 && pgData.originalPageIndex < sourcePdf.getPageCount()) {
      outPage = copiedSourcePages[copiedIndex++];
      outPdf.addPage(outPage);
      
      const { width, height } = outPage.getSize();
      pw = width;
      ph = height;
      
      const currentRotation = outPage.getRotation().angle;
      if (pgData.rotation !== 0) {
        outPage.setRotation(degrees(currentRotation + pgData.rotation));
      }
      
      const totalRotation = currentRotation + pgData.rotation;
      if (totalRotation % 180 !== 0) {
        pw = height;
        ph = width;
      }
    } else if (pgData.canvas) {
      const dataUrl = pgData.canvas.toDataURL("image/jpeg", 0.92);
      const base64 = dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const embedded = await outPdf.embedJpg(bytes);
      // Fallback: 1 CSS pixel = 0.75 points
      const pageWidth = Math.max(1, pgData.canvas.width * 0.75);
      const pageHeight = Math.max(1, pgData.canvas.height * 0.75);
      outPage = outPdf.addPage([pageWidth, pageHeight]);
      outPage.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      pw = pageWidth;
      ph = pageHeight;
      if (pgData.rotation !== 0) {
        outPage.setRotation(degrees(pgData.rotation));
      }
    } else {
      continue;
    }

    if (pgData.crop) {
      const { top, right, bottom, left } = pgData.crop;
      const originalWidth = outPage.getWidth();
      const originalHeight = outPage.getHeight();

      const cropX = originalWidth * left;
      const cropY = originalHeight * bottom;
      const cropW = Math.max(1, originalWidth * (1 - left - right));
      const cropH = Math.max(1, originalHeight * (1 - top - bottom));

      outPage.setCropBox(cropX, cropY, cropW, cropH);
      outPage.setMediaBox(cropX, cropY, cropW, cropH);
    }

    const T = outPage.getRotation().angle % 360;
    const MW = outPage.getSize().width;
    const MH = outPage.getSize().height;

    for (const ann of pageAnns) {
      if (ann.kind === "watermark") {
        const text = ann.text;
        const opacity = ann.opacity;
        const fontSize = Math.max(28, Math.min(pw, ph) * 0.07);
        const font = fontBoldItalic;
        
        const diagonal = Math.hypot(pw, ph);
        const stepX = diagonal * 0.4;
        const stepY = Math.min(pw, ph) * 0.3;
        
        for (let y = -diagonal; y <= ph + diagonal; y += stepY) {
          for (let x = -diagonal; x <= pw + diagonal; x += stepX) {
            const vx = x;
            const vy = ph - y;
            const rx = vx / pw;
            const ry = vy / ph;
            let mx_frac = rx;
            let my_frac = 1 - ry;
            if (T === 90 || T === -270) { mx_frac = ry; my_frac = rx; }
            else if (T === 180 || T === -180) { mx_frac = 1 - rx; my_frac = ry; }
            else if (T === 270 || T === -90) { mx_frac = 1 - ry; my_frac = 1 - rx; }

            outPage.drawText(text, {
              x: mx_frac * MW,
              y: my_frac * MH,
              size: fontSize,
              font: font,
              color: rgb(0.58, 0.64, 0.72),
              opacity: opacity,
              rotate: degrees(-45 - T),
            });
          }
        }
      } else if (ann.kind === "text") {
        const boxW = ann.w * pw;
        const boxH = ann.h * ph;
        const cx = ann.x * pw;
        const cy = ann.y * ph;
        
        const fontSize = Math.max(6, Math.round(ann.fontSize * (pw / 800)));
        const lineHeight = fontSize * 1.2;
        
        const font = ann.bold && ann.italic ? fontBoldItalic :
                     ann.bold ? fontBold :
                     ann.italic ? fontItalic : fontRegular;
                     
        const lines = wrapPdfText(ann.text, font, fontSize, boxW);
        const maxLines = Math.max(1, Math.floor(boxH / lineHeight));
        const color = hexToRgb(ann.color);
        
        lines.slice(0, maxLines).forEach((line, index) => {
          const local_x = -boxW / 2;
          const local_y = -boxH / 2 + index * lineHeight + fontSize;

          const angle = (ann.rotation * Math.PI) / 180;
          const vx = cx + local_x * Math.cos(angle) - local_y * Math.sin(angle);
          const vy = cy + local_x * Math.sin(angle) + local_y * Math.cos(angle);

          const rx = vx / pw;
          const ry = vy / ph;
          let mx_frac = rx;
          let my_frac = 1 - ry;
          if (T === 90 || T === -270) { mx_frac = ry; my_frac = rx; }
          else if (T === 180 || T === -180) { mx_frac = 1 - rx; my_frac = ry; }
          else if (T === 270 || T === -90) { mx_frac = 1 - ry; my_frac = 1 - rx; }

          outPage.drawText(line, {
            x: mx_frac * MW,
            y: my_frac * MH,
            size: fontSize,
            font: font,
            color: color,
            rotate: degrees(-(ann.rotation + T)),
          });
        });
      } else if (ann.kind === "highlight") {
        const boxW = ann.w * pw;
        const boxH = ann.h * ph;
        const cx = ann.x * pw;
        const cy = ann.y * ph;

        const local_x = -boxW / 2;
        const local_y = boxH / 2;
        
        const angle = (ann.rotation * Math.PI) / 180;
        const vx = cx + local_x * Math.cos(angle) - local_y * Math.sin(angle);
        const vy = cy + local_x * Math.sin(angle) + local_y * Math.cos(angle);

        const rx = vx / pw;
        const ry = vy / ph;
        let mx_frac = rx;
        let my_frac = 1 - ry;
        if (T === 90 || T === -270) { mx_frac = ry; my_frac = rx; }
        else if (T === 180 || T === -180) { mx_frac = 1 - rx; my_frac = ry; }
        else if (T === 270 || T === -90) { mx_frac = 1 - ry; my_frac = 1 - rx; }

        const color = hexToRgb(ann.color);
        outPage.drawRectangle({
          x: mx_frac * MW,
          y: my_frac * MH,
          width: boxW,
          height: boxH,
          color: color,
          opacity: ann.opacity,
          rotate: degrees(-(ann.rotation + T)),
        });
      } else if (ann.kind === "ink") {
        if (ann.points.length < 2) continue;
        const color = hexToRgb(ann.color);
        const thickness = Math.max(1, ann.strokeWidth * (pw / 800));
        
        for (let j = 1; j < ann.points.length; j++) {
          const p1 = ann.points[j - 1];
          const p2 = ann.points[j];

          const mapPoint = (rx: number, ry: number) => {
            let mx_frac = rx;
            let my_frac = 1 - ry;
            if (T === 90 || T === -270) { mx_frac = ry; my_frac = rx; }
            else if (T === 180 || T === -180) { mx_frac = 1 - rx; my_frac = ry; }
            else if (T === 270 || T === -90) { mx_frac = 1 - ry; my_frac = 1 - rx; }
            return { x: mx_frac * MW, y: my_frac * MH };
          };

          outPage.drawLine({
            start: mapPoint(p1.x, p1.y),
            end: mapPoint(p2.x, p2.y),
            thickness: thickness,
            color: color,
            opacity: ann.opacity,
          });
        }
      } else if (ann.kind === "signature") {
        try {
          const base64 = ann.dataUrl.split(",")[1];
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const embedded = await outPdf.embedPng(bytes);
          
          const boxW = ann.w * pw;
          const boxH = ann.h * ph;
          const cx = ann.x * pw;
          const cy = ann.y * ph;
          
          const local_x = -boxW / 2;
          const local_y = boxH / 2;
          
          const angle = (ann.rotation * Math.PI) / 180;
          const vx = cx + local_x * Math.cos(angle) - local_y * Math.sin(angle);
          const vy = cy + local_x * Math.sin(angle) + local_y * Math.cos(angle);

          const rx = vx / pw;
          const ry = vy / ph;
          let mx_frac = rx;
          let my_frac = 1 - ry;
          if (T === 90 || T === -270) { mx_frac = ry; my_frac = rx; }
          else if (T === 180 || T === -180) { mx_frac = 1 - rx; my_frac = ry; }
          else if (T === 270 || T === -90) { mx_frac = 1 - ry; my_frac = 1 - rx; }

          outPage.drawImage(embedded, {
            x: mx_frac * MW,
            y: my_frac * MH,
            width: boxW,
            height: boxH,
            opacity: ann.opacity,
            rotate: degrees(-(ann.rotation + T)),
          });
        } catch (err) {
          console.error("Failed to embed signature", err);
        }
      }
    }
  }

  return await outPdf.save();
}
