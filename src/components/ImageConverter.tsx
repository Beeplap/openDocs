
"use client";

import React from "react";
import Upload from "./Upload";
import { convertFile, type OutputFormat } from "../utils/convertImage";
import { getPdfFirstPagePreview, getPdfPageCount } from "../utils/pdfUtils";

const outputOptions: { label: string; value: OutputFormat }[] = [
  { label: "PDF", value: "application/pdf" },
  { label: "JPG", value: "image/jpeg" },
  { label: "PNG", value: "image/png" },
  { label: "WEBP", value: "image/webp" },
  { label: "SVG", value: "image/svg+xml" },
];

type DownloadMode = "zip" | "separate";
type ConverterPurpose = "convert" | "compress";
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const MAX_CONVERT_PDF_PAGES = 100;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionFromMime(type: OutputFormat) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/svg+xml") return "svg";
  return "jpg";
}

function mimeLabel(type: string) {
  if (type === "application/pdf") return "PDF";
  if (type.includes("png")) return "PNG";
  if (type.includes("webp")) return "WEBP";
  if (type.includes("svg")) return "SVG";
  if (type.includes("jpeg") || type.includes("jpg")) return "JPG";
  if (type.includes("heic")) return "HEIC";
  if (type.includes("heif")) return "HEIF";
  return type || "Unknown";
}

function detectInputFormat(file: File): OutputFormat | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (type === "image/svg+xml" || name.endsWith(".svg")) return "image/svg+xml";
  if (type === "image/png" || name.endsWith(".png")) return "image/png";
  if (type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (type === "image/jpeg" || type === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

function defaultOutputFormat(file: File, purpose: ConverterPurpose): OutputFormat {
  const inputFormat = detectInputFormat(file);
  if (purpose === "compress") return inputFormat ?? "image/jpeg";
  if (inputFormat === "application/pdf") return "image/jpeg";
  if (inputFormat === "image/svg+xml") return "image/png";
  if (inputFormat === "image/jpeg" || inputFormat === "image/png") return "application/pdf";
  if (inputFormat === "image/webp") return "image/jpeg";
  return "image/jpeg";
}

function estimateOutputSize(file: File, outputFormat: OutputFormat, quality: number, pageCount: number | null) {
  const inputFormat = detectInputFormat(file);
  const isSameFormat = inputFormat === outputFormat;
  const inputSize = file.size;

  if (isSameFormat) {
    if (outputFormat === "image/png") return Math.max(1024, Math.round(inputSize * 0.96));
    if (outputFormat === "image/svg+xml") return Math.max(512, Math.round(inputSize * 0.9));
    if (outputFormat === "application/pdf") return Math.max(1024, Math.round(inputSize * (0.28 + quality * 0.72)));
    return Math.max(1024, Math.round(inputSize * (0.16 + quality * 0.78)));
  }

  if (inputFormat === "application/pdf" && outputFormat !== "application/pdf") {
    const pages = Math.max(1, pageCount ?? 1);
    const perPageBaseline = Math.max(120 * 1024, Math.min(1.5 * 1024 * 1024, inputSize / pages));
    const formatFactor = outputFormat === "image/png" ? 1.35 : outputFormat === "image/webp" ? 0.58 : outputFormat === "image/svg+xml" ? 1.55 : 0.72;
    return Math.round(perPageBaseline * pages * formatFactor * (0.35 + quality * 0.75));
  }

  if (outputFormat === "application/pdf") {
    return Math.max(1024, Math.round(inputSize * (0.55 + quality * 0.65)));
  }

  if (outputFormat === "image/svg+xml") return Math.max(1024, Math.round(inputSize * 1.18));
  if (outputFormat === "image/png") return Math.max(1024, Math.round(inputSize * 1.25));
  if (outputFormat === "image/webp") return Math.max(1024, Math.round(inputSize * (0.28 + quality * 0.62)));
  return Math.max(1024, Math.round(inputSize * (0.32 + quality * 0.72)));
}

function qualityAffectsOutput(file: File, outputFormat: OutputFormat) {
  const inputFormat = detectInputFormat(file);

  if (outputFormat === "image/jpeg" || outputFormat === "image/webp" || outputFormat === "application/pdf") {
    return true;
  }

  if (inputFormat === "application/pdf" && (outputFormat === "image/png" || outputFormat === "image/svg+xml")) {
    return true;
  }

  return false;
}

function defaultQualityFor(file: File, outputFormat: OutputFormat) {
  if (!qualityAffectsOutput(file, outputFormat)) return 1;
  return detectInputFormat(file) === outputFormat ? 0.7 : 1;
}

function downloadBlob(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createZipBlob(entries: { blob: Blob; fileName: string }[]) {
  const encoder = new TextEncoder();
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.fileName);
    const fileBytes = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(fileBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, fileBytes.length);
    writeUint32(localView, 22, fileBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    fileParts.push(localHeader, fileBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, fileBytes.length);
    writeUint32(centralView, 24, fileBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + fileBytes.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  const zipParts = [...fileParts, ...centralParts, endHeader].map(toArrayBuffer);
  return new Blob(zipParts, { type: "application/zip" });
}

export default function ImageConverter({ purpose = "convert" }: { purpose?: ConverterPurpose }) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [outputFormat, setOutputFormat] = React.useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = React.useState(0.7);
  const [isConverting, setIsConverting] = React.useState(false);
  const [outputSize, setOutputSize] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState("Upload an image or PDF to start.");
  const [warning, setWarning] = React.useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = React.useState<number | null>(null);
  const [downloadMode, setDownloadMode] = React.useState<DownloadMode>("zip");
  const previewRunRef = React.useRef(0);

  const primaryFile = files[0] ?? null;
  const inputFormat = primaryFile ? detectInputFormat(primaryFile) : null;
  const isCompression = purpose === "compress" || (!!primaryFile && inputFormat === outputFormat);
  const expectsMultipleOutputs =
    files.length > 1 || (inputFormat === "application/pdf" && outputFormat !== "application/pdf" && (pdfPageCount ?? 0) > 1);
  const fileTooLarge = files.some((f) => f.size > MAX_UPLOAD_BYTES);
  const pdfTooLong = inputFormat === "application/pdf" && pdfPageCount !== null && pdfPageCount > MAX_CONVERT_PDF_PAGES;
  const availableOutputOptions = React.useMemo(() => {
    if (purpose === "compress" && inputFormat) {
      return outputOptions.filter((option) => option.value === inputFormat);
    }
    return outputOptions;
  }, [inputFormat, purpose]);
  const estimatedOutputSize = React.useMemo(() => {
    if (files.length === 0) return null;
    return files.reduce((acc, f) => acc + (estimateOutputSize(f, outputFormat, quality, pdfPageCount) || 0), 0);
  }, [files, outputFormat, pdfPageCount, quality]);
  const canTuneQuality = primaryFile ? qualityAffectsOutput(primaryFile, outputFormat) : true;

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function applyOutputFormat(nextFormat: OutputFormat, nextFile = primaryFile) {
    setOutputFormat(nextFormat);
    setQuality(nextFile ? defaultQualityFor(nextFile, nextFormat) : 1);
    setOutputSize(null);
    setWarning(null);
    setDownloadMode("zip");
  }

  function onFilesSelected(nextFiles: File[]) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const runId = previewRunRef.current + 1;
    previewRunRef.current = runId;
    
    const nextPrimaryFile = nextFiles[0];
    if (!nextPrimaryFile) return;

    const nextOutputFormat = defaultOutputFormat(nextPrimaryFile, purpose);

    setFiles(nextFiles);
    setPreviewUrl(null);
    setPdfPageCount(null);
    setOutputSize(null);
    setWarning(null);
    setOutputFormat(nextOutputFormat);
    setQuality(defaultQualityFor(nextPrimaryFile, nextOutputFormat));
    setDownloadMode("zip");
    setStatus(purpose === "compress" ? "Adjust the quality and compress the files." : "Choose an output format and quality.");

    const hasTooLarge = nextFiles.some((f) => f.size > MAX_UPLOAD_BYTES);
    if (hasTooLarge) {
      setWarning(`Files are limited to ${formatBytes(MAX_UPLOAD_BYTES)} for browser processing.`);
      setStatus("Choose smaller files to continue.");
      return;
    }

    if (nextFiles.length === 1 && detectInputFormat(nextPrimaryFile) === "application/pdf") {
      void Promise.all([getPdfFirstPagePreview(nextPrimaryFile), getPdfPageCount(nextPrimaryFile)])
        .then(([previewBlob, pageCount]) => {
          if (previewRunRef.current !== runId) return;
          setPreviewUrl(URL.createObjectURL(previewBlob));
          setPdfPageCount(pageCount);
          if (pageCount > MAX_CONVERT_PDF_PAGES) {
            setWarning(`PDFs are limited to ${MAX_CONVERT_PDF_PAGES} pages for browser conversion.`);
            setStatus("Choose a shorter PDF to continue.");
          }
        })
        .catch(() => {
          if (previewRunRef.current !== runId) return;
          setPreviewUrl(null);
          setPdfPageCount(null);
        });
      return;
    }

    if (nextFiles.length === 1) {
      setPreviewUrl(URL.createObjectURL(nextPrimaryFile));
    }
  }

  async function handleConvert() {
    if (files.length === 0) return;
    if (fileTooLarge || pdfTooLong) {
      setStatus(fileTooLarge ? "Choose smaller files to continue." : "Choose a shorter PDF to continue.");
      return;
    }

    setIsConverting(true);
    setWarning(null);
    setStatus(isCompression ? "Compressing..." : "Converting...");

    try {
      const allNamedOutputs: { blob: Blob; outputFormat: OutputFormat; fileName: string }[] = [];
      let totalBytes = 0;
      let hasWarning = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await convertFile({ file, outputFormat, quality });
        totalBytes += result.outputs.reduce((sum, output) => sum + output.blob.size, 0);
        if (result.warning) hasWarning = true;

        const baseName = file.name.replace(/\.[^/.]+$/, "");
        result.outputs.forEach((output, index) => {
          const extension = extensionFromMime(output.outputFormat);
          const isMultipleForThisFile = result.outputs.length > 1;
          const outputName =
            isMultipleForThisFile ? `${baseName}-page-${index + 1}.${extension}` : `${baseName}-opendocs.${extension}`;
          allNamedOutputs.push({ ...output, fileName: outputName });
        });
      }

      setOutputSize(totalBytes);
      if (hasWarning) setWarning("Some processing issues occurred. Check outputs.");

      if (allNamedOutputs.length > 1 && downloadMode === "zip") {
        const zipBlob = await createZipBlob(allNamedOutputs);
        const zipName = files.length > 1 ? "opendocs-batch.zip" : `${files[0].name.replace(/\.[^/.]+$/, "")}-opendocs.zip`;
        downloadBlob(zipBlob, zipName);
      } else {
        allNamedOutputs.forEach((output) => {
          downloadBlob(output.blob, output.fileName);
        });
      }

      setStatus(
        allNamedOutputs.length > 1
          ? `${isCompression ? "Compressed" : "Converted"} ${allNamedOutputs.length} files ${
              downloadMode === "zip" ? "in a ZIP." : "separately."
            }`
          : `${isCompression ? "Compressed" : "Converted"} file downloaded.`
      );
    } catch {
      setStatus("Processing failed. Try another format or quality.");
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-semibold text-slate-950">{purpose === "compress" ? "Compress files" : "Convert files"}</h2>
      </div>

      <div className="mt-4 space-y-4">
        <Upload onFilesSelected={onFilesSelected} multiple={true} acceptedTypes="image/*,application/pdf,.heic,.heif,.svg" disabled={isConverting} />

        {files.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {files.length === 1 && previewUrl ? (
                <img src={previewUrl} alt={`Preview`} className="aspect-square w-full object-contain bg-slate-50" />
              ) : (
                <div className="grid aspect-square place-items-center p-6 text-center text-sm text-slate-500 bg-slate-50">
                  {files.length === 1 ? "Preview unavailable" : `${files.length} files selected`}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-900">{files.length === 1 ? files[0].name : `${files.length} files`}</p>
              {files.length === 1 ? (
                <>
                  <p className="mt-1 text-slate-600">Original format: {mimeLabel(inputFormat ?? files[0].type)}</p>
                  <p className="mt-1 text-slate-600">Original size: {formatBytes(files[0].size)}</p>
                  {pdfPageCount ? <p className="mt-1 text-slate-600">Pages: {pdfPageCount}</p> : null}
                </>
              ) : (
                <p className="mt-1 text-slate-600">Total size: {formatBytes(files.reduce((acc, f) => acc + f.size, 0))}</p>
              )}
              <p className="mt-1 text-slate-600">Mode: {isCompression ? "Compression" : "Conversion"}</p>
              {estimatedOutputSize !== null ? (
                <p className="mt-1 text-indigo-700">Estimated output size: {formatBytes(estimatedOutputSize)}</p>
              ) : null}
              {outputSize !== null ? <p className="mt-1 text-emerald-700">Last output size: {formatBytes(outputSize)}</p> : null}
            </div>
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Output format</span>
              {purpose === "compress" ? (
                <span className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {mimeLabel(outputFormat)}
                </span>
              ) : (
                <select
                  value={outputFormat}
                  onChange={(e) => applyOutputFormat(e.target.value as OutputFormat)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring"
                >
                  {availableOutputOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="mt-4 block">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Quality</span>
                <span className="text-slate-500">{canTuneQuality ? `${Math.round(quality * 100)}%` : "Not adjustable"}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                disabled={!canTuneQuality}
                onChange={(e) => {
                  setQuality(Number(e.target.value));
                  setOutputSize(null);
                  setWarning(null);
                }}
                className="w-full accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Smaller</span>
                <span>Best quality</span>
              </div>
              {!canTuneQuality ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This output format is lossless here, so the estimated size will not change with quality.
                </p>
              ) : null}
            </label>

            {warning ? <p className="mt-3 text-sm font-medium text-amber-700">{warning}</p> : null}

            {expectsMultipleOutputs ? (
              <fieldset className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">Download multiple files</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input
                      type="radio"
                      name="download-mode"
                      value="zip"
                      checked={downloadMode === "zip"}
                      onChange={() => setDownloadMode("zip")}
                      className="accent-emerald-600"
                    />
                    Download ZIP
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input
                      type="radio"
                      name="download-mode"
                      value="separate"
                      checked={downloadMode === "separate"}
                      onChange={() => setDownloadMode("separate")}
                      className="accent-emerald-600"
                    />
                    Download separately
                  </label>
                </div>
              </fieldset>
            ) : null}

            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={isConverting || fileTooLarge || pdfTooLong}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConverting ? "Processing..." : isCompression ? "Compress & Download" : "Convert & Download"}
            </button>
          </div>
        ) : null}

        {files.length > 0 ? <p className="text-sm text-slate-500">{status}</p> : null}
      </div>
    </section>
  );
}
