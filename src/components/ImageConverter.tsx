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
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionFromMime(type: OutputFormat) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function mimeLabel(type: string) {
  if (type === "application/pdf") return "PDF";
  if (type.includes("png")) return "PNG";
  if (type.includes("webp")) return "WEBP";
  if (type.includes("jpeg") || type.includes("jpg")) return "JPG";
  if (type.includes("heic")) return "HEIC";
  if (type.includes("heif")) return "HEIF";
  return type || "Unknown";
}

function detectInputFormat(file: File): OutputFormat | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (type === "image/png" || name.endsWith(".png")) return "image/png";
  if (type === "image/webp" || name.endsWith(".webp")) return "image/webp";
  if (type === "image/jpeg" || type === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

function defaultOutputFormat(file: File): OutputFormat {
  return detectInputFormat(file) ?? "image/jpeg";
}

function estimateOutputSize(file: File, outputFormat: OutputFormat, quality: number, pageCount: number | null) {
  const inputFormat = detectInputFormat(file);
  const isSameFormat = inputFormat === outputFormat;
  const inputSize = file.size;

  if (isSameFormat) {
    if (outputFormat === "image/png") return Math.max(1024, Math.round(inputSize * 0.96));
    if (outputFormat === "application/pdf") return Math.max(1024, Math.round(inputSize * (0.28 + quality * 0.72)));
    return Math.max(1024, Math.round(inputSize * (0.16 + quality * 0.78)));
  }

  if (inputFormat === "application/pdf" && outputFormat !== "application/pdf") {
    const pages = Math.max(1, pageCount ?? 1);
    const perPageBaseline = Math.max(120 * 1024, Math.min(1.5 * 1024 * 1024, inputSize / pages));
    const formatFactor = outputFormat === "image/png" ? 1.35 : outputFormat === "image/webp" ? 0.58 : 0.72;
    return Math.round(perPageBaseline * pages * formatFactor * (0.35 + quality * 0.75));
  }

  if (outputFormat === "application/pdf") {
    return Math.max(1024, Math.round(inputSize * (0.55 + quality * 0.65)));
  }

  if (outputFormat === "image/png") return Math.max(1024, Math.round(inputSize * 1.25));
  if (outputFormat === "image/webp") return Math.max(1024, Math.round(inputSize * (0.28 + quality * 0.62)));
  return Math.max(1024, Math.round(inputSize * (0.32 + quality * 0.72)));
}

function downloadBlob(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

export default function ImageConverter() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [outputFormat, setOutputFormat] = React.useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = React.useState(0.7);
  const [isConverting, setIsConverting] = React.useState(false);
  const [outputSize, setOutputSize] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState("Upload an image or PDF to start.");
  const [warning, setWarning] = React.useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = React.useState<number | null>(null);
  const previewRunRef = React.useRef(0);

  const inputFormat = file ? detectInputFormat(file) : null;
  const isCompression = !!file && inputFormat === outputFormat;
  const estimatedOutputSize = React.useMemo(() => {
    if (!file) return null;
    return estimateOutputSize(file, outputFormat, quality, pdfPageCount);
  }, [file, outputFormat, pdfPageCount, quality]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function applyOutputFormat(nextFormat: OutputFormat, nextFile = file) {
    setOutputFormat(nextFormat);
    setQuality(nextFile && detectInputFormat(nextFile) === nextFormat ? 0.7 : 1);
    setOutputSize(null);
    setWarning(null);
  }

  function onFileSelected(nextFile: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const runId = previewRunRef.current + 1;
    previewRunRef.current = runId;
    const nextOutputFormat = defaultOutputFormat(nextFile);

    setFile(nextFile);
    setPreviewUrl(null);
    setPdfPageCount(null);
    setOutputSize(null);
    setWarning(null);
    setOutputFormat(nextOutputFormat);
    setQuality(detectInputFormat(nextFile) === nextOutputFormat ? 0.7 : 1);
    setStatus("Choose an output format and quality.");

    if (detectInputFormat(nextFile) === "application/pdf") {
      void Promise.all([getPdfFirstPagePreview(nextFile), getPdfPageCount(nextFile)])
        .then(([previewBlob, pageCount]) => {
          if (previewRunRef.current !== runId) return;
          setPreviewUrl(URL.createObjectURL(previewBlob));
          setPdfPageCount(pageCount);
        })
        .catch(() => {
          if (previewRunRef.current !== runId) return;
          setPreviewUrl(null);
          setPdfPageCount(null);
        });
      return;
    }

    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  async function handleConvert() {
    if (!file) return;

    setIsConverting(true);
    setWarning(null);
    setStatus(isCompression ? "Compressing file..." : "Converting file...");

    try {
      const result = await convertFile({ file, outputFormat, quality });
      const totalBytes = result.outputs.reduce((sum, output) => sum + output.blob.size, 0);
      setOutputSize(totalBytes);
      if (result.warning) setWarning(result.warning);

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      result.outputs.forEach((output) => {
        const pageSuffix = result.outputs.length > 1 && output.pageIndex ? `-page-${output.pageIndex}` : "";
        downloadBlob(output.blob, `${baseName}${pageSuffix}-opendocs.${extensionFromMime(output.outputFormat)}`);
      });

      setStatus(
        result.outputs.length > 1
          ? `${isCompression ? "Compressed" : "Converted"} ${result.outputs.length} files.`
          : `${isCompression ? "Compressed" : "Converted"} file downloaded.`
      );
    } catch {
      if (file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) {
        setStatus("HEIC decode failed in this browser. Try another source image.");
      } else {
        setStatus("Processing failed. Try another format or quality.");
      }
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-semibold text-slate-950">Convert files</h2>
      </div>

      <div className="mt-4 space-y-4">
        <Upload onFileSelected={onFileSelected} acceptedTypes="image/*,application/pdf,.heic,.heif" disabled={isConverting} />

        {file ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {previewUrl ? (
                <img src={previewUrl} alt={`Preview of ${file.name}`} className="aspect-square w-full object-contain bg-slate-50" />
              ) : (
                <div className="grid aspect-square place-items-center p-6 text-center text-sm text-slate-500">
                  Preview unavailable
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-900">{file.name}</p>
              <p className="mt-1 text-slate-600">Original format: {mimeLabel(inputFormat ?? file.type)}</p>
              <p className="mt-1 text-slate-600">Original size: {formatBytes(file.size)}</p>
              {pdfPageCount ? <p className="mt-1 text-slate-600">Pages: {pdfPageCount}</p> : null}
              <p className="mt-1 text-slate-600">Mode: {isCompression ? "Compression" : "Conversion"}</p>
              {estimatedOutputSize !== null ? (
                <p className="mt-1 text-indigo-700">Estimated output size: {formatBytes(estimatedOutputSize)}</p>
              ) : null}
              {outputSize !== null ? <p className="mt-1 text-emerald-700">Last output size: {formatBytes(outputSize)}</p> : null}
            </div>
          </div>
        ) : null}

        {file ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Output format</span>
              <select
                value={outputFormat}
                onChange={(e) => applyOutputFormat(e.target.value as OutputFormat)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring"
              >
                {outputOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">Quality</span>
                <span className="text-slate-500">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                onChange={(e) => {
                  setQuality(Number(e.target.value));
                  setOutputSize(null);
                  setWarning(null);
                }}
                className="w-full accent-emerald-600"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Smaller</span>
                <span>Best quality</span>
              </div>
            </label>

            {warning ? <p className="mt-3 text-sm font-medium text-amber-700">{warning}</p> : null}

            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={isConverting}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConverting ? "Processing..." : isCompression ? "Compress & Download" : "Convert & Download"}
            </button>
          </div>
        ) : null}

        {file ? <p className="text-sm text-slate-500">{status}</p> : null}
      </div>
    </section>
  );
}
