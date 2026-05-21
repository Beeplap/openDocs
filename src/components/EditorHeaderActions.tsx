"use client";

type Props = {
  enabled: boolean;
};

export default function EditorHeaderActions({ enabled }: Props) {
  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("opendocs:new-pdf"))}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
    >
      <ReloadIcon className="h-4 w-4" />
      New PDF
    </button>
  );
}

function ReloadIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.5 4.5V8H12M4.5 15.5V12H8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.9 8A5.5 5.5 0 0 0 5.2 6.2M5.1 12a5.5 5.5 0 0 0 9.7 1.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
