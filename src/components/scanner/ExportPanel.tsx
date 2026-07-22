import PageLayoutSelector from "./PageLayoutSelector";
import { EditIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  mergeMode: MergeMode;
  setMergeMode: (mode: MergeMode) => void;
  pdfOrderItems: ScanItem[];
  previewOrderedItems: ScanItem[];
  mergePreviewUrls: string[];
  isGeneratingPreview: boolean;
  isProcessing: boolean;
  statusMessage: string;
  exportPdf: () => void | Promise<void>;
  openPdfPageEditor: (pageIndex: number) => void;
};

export default function ExportPanel({
  mergeMode,
  setMergeMode,
  pdfOrderItems,
  previewOrderedItems,
  mergePreviewUrls,
  isGeneratingPreview,
  isProcessing,
  statusMessage,
  exportPdf,
  openPdfPageEditor,
}: Props) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Export</h2>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{pdfOrderItems.length} pages</div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <PageLayoutSelector value={mergeMode} onChange={setMergeMode} />

        <button
          onClick={() => void exportPdf()}
          disabled={pdfOrderItems.length === 0 || isProcessing}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? "Building PDF..." : "Merge Selected to PDF"}
        </button>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600" aria-live="polite">
          {statusMessage}
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Preview</p>
          {pdfOrderItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No pages selected.</p>
          ) : isGeneratingPreview ? (
            <p className="mt-2 text-sm text-slate-500">Rendering preview...</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {Array.from({
                length:
                  mergeMode === "twoUp"
                    ? Math.min(Math.ceil(pdfOrderItems.length / 2), 3)
                    : mergeMode === "firstTwoUp"
                      ? Math.min(pdfOrderItems.length <= 2 ? 1 : 1 + (pdfOrderItems.length - 2), 3)
                      : Math.min(pdfOrderItems.length, 3),
              }).map((_, pageIdx) => {
                const pageNumber = pageIdx + 1;
                const mergedUrl = mergePreviewUrls[pageIdx] ?? null;
                const isFirstPageTwoUp = mergeMode === "firstTwoUp" && pageIdx === 0;
                const isAllTwoUp = mergeMode === "twoUp";
                const isTwoUpSlot = isAllTwoUp || isFirstPageTwoUp;
                const topItem = isTwoUpSlot
                  ? previewOrderedItems[pageIdx * 2]
                  : mergeMode === "firstTwoUp"
                    ? previewOrderedItems[pageIdx + 1]
                    : previewOrderedItems[pageIdx];
                const bottomItem = isTwoUpSlot ? previewOrderedItems[pageIdx * 2 + 1] : null;

                return (
                  <div key={pageNumber} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                    <div className="absolute left-2 top-2 z-10 rounded-md bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {pageNumber}
                    </div>
                    <button
                      type="button"
                      onClick={() => openPdfPageEditor(pageIdx)}
                      className="absolute right-2 top-2 z-20 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:text-emerald-700"
                      aria-label={`Edit PDF page ${pageNumber}`}
                      title="Edit A4 page"
                    >
                      <EditIcon />
                    </button>

                    <div className="sm:hidden">
                      {mergeMode === "twoUp" ? (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            {topItem ? (
                              <img src={topItem.previewUrl} alt={`Front ${pageNumber}`} className="aspect-3/4 w-full rounded-md border border-slate-200 bg-white object-cover" />
                            ) : (
                              <div className="aspect-3/4 w-full rounded-md border border-slate-200 bg-slate-50" />
                            )}
                          </div>
                          <div className="flex-1">
                            {bottomItem ? (
                              <img src={bottomItem.previewUrl} alt={`Back ${pageNumber}`} className="aspect-3/4 w-full rounded-md border border-slate-200 bg-white object-cover" />
                            ) : (
                              <div className="aspect-3/4 w-full rounded-md border border-slate-200 bg-slate-50" />
                            )}
                          </div>
                        </div>
                      ) : topItem ? (
                        <img src={topItem.previewUrl} alt={`Page ${pageNumber}`} className="aspect-3/4 w-full rounded-md border border-slate-200 bg-white object-cover" />
                      ) : (
                        <div className="aspect-3/4 w-full rounded-md border border-slate-200 bg-slate-50" />
                      )}
                    </div>

                    <div className="hidden sm:block">
                      {mergedUrl ? (
                        <img src={mergedUrl} alt={`Merged preview page ${pageNumber}`} className="aspect-3/4 w-full rounded-md border border-slate-200 bg-white object-cover" />
                      ) : (
                        <div className="aspect-3/4 w-full rounded-md border border-slate-200 bg-slate-50" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
