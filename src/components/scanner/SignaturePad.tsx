"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
};

type Point = { x: number; y: number };

export default function SignaturePad({ open, onApply, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [penColor, setPenColor] = useState("#1a1a2e");
  const [penSize, setPenSize] = useState(3);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const lastPoint = useRef<Point | null>(null);

  // Detect mobile portrait and force landscape layout
  useEffect(() => {
    if (!open) return;
    const check = () => {
      const isMobile = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsMobileLandscape(isMobile && isPortrait);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [open]);

  // Try to lock to landscape on mobile
  useEffect(() => {
    if (!open || !isMobileLandscape) return;
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.("landscape").catch(() => {});
    } catch {}
    return () => {
      try {
        const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
        orientation.unlock?.();
      } catch {}
    };
  }, [open, isMobileLandscape]);

  // Clear canvas when opened
  useEffect(() => {
    if (!open) return;
    clearCanvas();
  }, [open]);

  function getCtx() {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext("2d") : null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    lastPoint.current = null;
  }

  function getPos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPoint.current = pos;
    setIsDrawing(true);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !lastPoint.current) return;
    const pos = getPos(e);
    ctx.lineWidth = penSize * (e.pressure > 0 ? e.pressure * 1.5 + 0.5 : 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
    setHasStrokes(true);
  }

  function endDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setIsDrawing(false);
    lastPoint.current = null;
  }

  function handleApply() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    // Trim transparent edges for cleaner result
    const trimmed = trimCanvas(canvas);
    onApply(trimmed);
  }

  if (!open) return null;

  // On mobile portrait, we render the signature pad rotated 90° so it appears landscape
  const rotateStyle: React.CSSProperties = isMobileLandscape
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 100,
        width: "100vh",
        height: "100vw",
        transform: "rotate(90deg)",
        transformOrigin: "center center",
        left: "calc(50vw - 50vh)",
        top: "calc(50vh - 50vw)",
      }
    : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div
        className="flex flex-col bg-white shadow-2xl overflow-hidden"
        style={{
          borderRadius: isMobileLandscape ? 0 : "24px",
          width: isMobileLandscape ? "100vh" : "min(92vw, 640px)",
          height: isMobileLandscape ? "100vw" : "auto",
          maxHeight: isMobileLandscape ? "100vw" : "90vh",
          ...rotateStyle,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 flex-shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Digital Signature</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">Draw your signature</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            aria-label="Close signature pad"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M14 4L4 14M4 4l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 flex-shrink-0 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Color</span>
            {["#1a1a2e", "#1e3a8a", "#7c3aed"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPenColor(c)}
                className="h-7 w-7 rounded-full border-2 transition"
                style={{
                  background: c,
                  borderColor: penColor === c ? "#6d28d9" : "transparent",
                  boxShadow: penColor === c ? "0 0 0 2px white, 0 0 0 4px #6d28d9" : "none",
                }}
                aria-label={`Set pen color ${c}`}
              />
            ))}
            <input
              type="color"
              value={penColor}
              onChange={(e) => setPenColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded-full border-2 border-slate-200 bg-white p-0"
              title="Custom color"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto sm:ml-0">
            <span className="text-xs font-semibold text-slate-500">Size</span>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={penSize}
              onChange={(e) => setPenSize(parseFloat(e.target.value))}
              className="w-24 accent-emerald-600"
            />
            <span className="text-xs text-slate-500 w-5">{penSize}</span>
          </div>

          <button
            type="button"
            onClick={clearCanvas}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M2 12L12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Clear
          </button>
        </div>

        {/* Canvas */}
        <div className="relative flex-1 overflow-hidden bg-slate-50" style={{ minHeight: isMobileLandscape ? 0 : "220px" }}>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {!hasStrokes && (
              <p className="select-none text-sm text-slate-400 font-medium">Sign here ↑</p>
            )}
          </div>
          {/* Baseline guides */}
          <div className="absolute left-6 right-6 bottom-12 border-b-2 border-dashed border-emerald-200 pointer-events-none" />
          <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="h-full w-full cursor-crosshair touch-none"
            style={{ display: "block" }}
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 flex-shrink-0">
          <p className="text-xs text-slate-400 hidden sm:block">
            {isMobileLandscape ? "Rotated to landscape for easier signing" : "Use mouse, touch, or stylus to sign"}
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!hasStrokes}
              onClick={handleApply}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Apply Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Trim transparent edges off a canvas and return a data URL */
function trimCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX > maxX || minY > maxY) return canvas.toDataURL("image/png");

  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const trimmedW = maxX - minX + 1;
  const trimmedH = maxY - minY + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimmedW;
  trimmedCanvas.height = trimmedH;
  const tCtx = trimmedCanvas.getContext("2d")!;
  tCtx.drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
  const url = trimmedCanvas.toDataURL("image/png");
  trimmedCanvas.remove();
  return url;
}
