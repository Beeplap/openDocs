"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CropPoint, DocumentCrop } from "./scanner/types";
import { defaultDocumentCrop, detectDocumentCrop, normalizeDocumentCrop } from "../utils/documentCrop";

type CropModalProps = {
  open: boolean;
  imageUrl: string | null;
  initialCrop: DocumentCrop | null;
  title?: string;
  onCancel: () => void;
  onApply: (crop: DocumentCrop) => void | Promise<void>;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load for cropping"));
  });
  return img;
}

function localCropToScreen(point: CropPoint, render: RenderBox) {
  return {
    x: render.offsetX + point.x * render.renderW,
    y: render.offsetY + point.y * render.renderH,
  };
}

function screenToLocalCrop(point: CropPoint, render: RenderBox) {
  return {
    x: clamp((point.x - render.offsetX) / render.renderW, 0, 1),
    y: clamp((point.y - render.offsetY) / render.renderH, 0, 1),
  };
}

type RenderBox = {
  offsetX: number;
  offsetY: number;
  renderW: number;
  renderH: number;
};

type DragState = {
  index: number | "shape";
  startPointer: CropPoint;
  startCrop: DocumentCrop;
};

const pointLabels = ["Top left", "Top right", "Bottom right", "Bottom left"];

export default function CropModal({ open, imageUrl, initialCrop, title, onCancel, onApply }: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [imageState, setImageState] = useState<{ src: string; image: HTMLImageElement; w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [cropState, setCropState] = useState<{ src: string; crop: DocumentCrop } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const activeImage = imageUrl && imageState?.src === imageUrl ? imageState : null;
  const fallbackCrop = useMemo(() => {
    if (!imageUrl) return null;
    return initialCrop ? normalizeDocumentCrop(initialCrop) : defaultDocumentCrop();
  }, [imageUrl, initialCrop]);
  const crop = imageUrl && cropState?.src === imageUrl ? cropState.crop : fallbackCrop;

  const render = useMemo<RenderBox | null>(() => {
    if (!activeImage || !container) return null;
    const scale = Math.min(container.w / activeImage.w, container.h / activeImage.h);
    const renderW = activeImage.w * scale;
    const renderH = activeImage.h * scale;
    return {
      renderW,
      renderH,
      offsetX: (container.w - renderW) / 2,
      offsetY: (container.h - renderH) / 2,
    };
  }, [activeImage, container]);

  const screenPoints = useMemo(() => {
    if (!crop || !render) return [];
    return crop.points.map((point) => localCropToScreen(point, render));
  }, [crop, render]);

  const setCrop = useCallback(
    (nextCrop: DocumentCrop) => {
      if (!imageUrl) return;
      setCropState({ src: imageUrl, crop: normalizeDocumentCrop(nextCrop) });
    },
    [imageUrl]
  );

  const runAutoDetect = useCallback(async () => {
    if (!imageUrl || !activeImage) return;
    setIsDetecting(true);
    try {
      const detected = await detectDocumentCrop(activeImage.image);
      setCrop(detected);
    } finally {
      setIsDetecting(false);
    }
  }, [activeImage, imageUrl, setCrop]);

  useEffect(() => {
    if (!open || !imageUrl) return;
    let cancelled = false;

    void loadImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        setImageState({
          src: imageUrl,
          image,
          w: image.naturalWidth || image.width,
          h: image.naturalHeight || image.height,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [imageUrl, open]);

  useEffect(() => {
    if (!open || initialCrop || !activeImage) return;
    if (cropState?.src === imageUrl) return;
    const timeout = window.setTimeout(() => {
      void runAutoDetect();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeImage, cropState?.src, imageUrl, initialCrop, open, runAutoDetect]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainer({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !activeImage || !render) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = Math.max(1, Math.round(render.renderW));
    canvas.height = Math.max(1, Math.round(render.renderH));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(activeImage.image, 0, 0, canvas.width, canvas.height);
  }, [activeImage, open, render]);

  function getLocalPoint(e: React.PointerEvent) {
    const el = containerRef.current;
    if (!el) return { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginDrag(index: number | "shape", e: React.PointerEvent<HTMLElement>) {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      index,
      startPointer: getLocalPoint(e),
      startCrop: crop,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !render) return;
    e.preventDefault();
    e.stopPropagation();

    const pt = getLocalPoint(e);
    const dx = (pt.x - drag.startPointer.x) / render.renderW;
    const dy = (pt.y - drag.startPointer.y) / render.renderH;

    if (drag.index === "shape") {
      setCrop({
        points: drag.startCrop.points.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        })) as DocumentCrop["points"],
      });
      return;
    }

    setCrop({
      points: drag.startCrop.points.map((point, index) =>
        index === drag.index
          ? screenToLocalCrop(
              {
                x: localCropToScreen(point, render).x + dx * render.renderW,
                y: localCropToScreen(point, render).y + dy * render.renderH,
              },
              render
            )
          : point
      ) as DocumentCrop["points"],
    });
  }

  function handlePointerUp(e?: React.PointerEvent<HTMLElement>) {
    if (e && dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    dragRef.current = null;
  }

  const handleApply = useCallback(async () => {
    if (!crop) return;
    setIsApplying(true);
    try {
      await onApply(normalizeDocumentCrop(crop));
    } finally {
      setIsApplying(false);
    }
  }, [crop, onApply]);

  useEffect(() => {
    if (!open) return;

    const handleConfirmKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest("button,input,select,textarea")) return;
      if (e.key === "Escape" && !isApplying) {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Enter" || !crop || isApplying) return;
      e.preventDefault();
      void handleApply();
    };

    window.addEventListener("keydown", handleConfirmKey);
    return () => window.removeEventListener("keydown", handleConfirmKey);
  }, [crop, handleApply, isApplying, onCancel, open]);

  if (!open) return null;

  const polygonPoints = screenPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Document crop</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{title ?? "Adjust document corners"}</div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            type="button"
            aria-label="Close crop modal"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div
            ref={containerRef}
            className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {imageUrl && render ? (
              <canvas
                ref={canvasRef}
                className="absolute"
                style={{
                  left: render.offsetX,
                  top: render.offsetY,
                  width: render.renderW,
                  height: render.renderH,
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {crop && render && container ? (
              <>
                <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
                  <defs>
                    <mask id="opendocs-crop-mask">
                      <rect x="0" y="0" width={container.w} height={container.h} fill="white" />
                      <polygon points={polygonPoints} fill="black" />
                    </mask>
                  </defs>
                  <rect x="0" y="0" width={container.w} height={container.h} fill="rgba(2,6,23,0.38)" mask="url(#opendocs-crop-mask)" />
                  <polygon points={polygonPoints} fill="rgba(16,185,129,0.08)" stroke="rgb(16,185,129)" strokeWidth="2.5" />
                </svg>

                <button
                  type="button"
                  aria-label="Move crop outline"
                  className="absolute cursor-move"
                  onPointerDown={(e) => beginDrag("shape", e)}
                  style={{
                    left: Math.min(...screenPoints.map((point) => point.x)),
                    top: Math.min(...screenPoints.map((point) => point.y)),
                    width: Math.max(...screenPoints.map((point) => point.x)) - Math.min(...screenPoints.map((point) => point.x)),
                    height: Math.max(...screenPoints.map((point) => point.y)) - Math.min(...screenPoints.map((point) => point.y)),
                    touchAction: "none",
                    background: "transparent",
                  }}
                />

                {screenPoints.map((point, index) => (
                  <button
                    key={pointLabels[index]}
                    type="button"
                    aria-label={`Move ${pointLabels[index]} crop point`}
                    title={pointLabels[index]}
                    onPointerDown={(e) => beginDrag(index, e)}
                    className="absolute grid h-10 w-10 cursor-grab place-items-center rounded-full border-2 border-white bg-emerald-500 shadow-xl active:cursor-grabbing"
                    style={{
                      left: point.x - 20,
                      top: point.y - 20,
                      touchAction: "none",
                    }}
                  >
                    <span className="h-3 w-3 rounded-full bg-white/95" />
                  </button>
                ))}
              </>
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-500">Preparing crop editor...</div>
            )}
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Corners</p>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void runAutoDetect()}
                disabled={!activeImage || isDetecting || isApplying}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDetecting ? "Finding document..." : "Auto detect"}
              </button>
              <button
                type="button"
                onClick={() => setCrop(defaultDocumentCrop())}
                disabled={isApplying}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset corners
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={isApplying}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isApplying || !crop}
              >
                {isApplying ? "Saving..." : "Done"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
