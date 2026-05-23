"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { savePendingFiles } from "../utils/pendingFiles";

type Props = {
  children: React.ReactNode;
};

export default function LandingUploadButton({ children }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setIsLoading(true);
    try {
      const pdfs = Array.from(fileList).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length === 0) return;
      await savePendingFiles("pdf-editor", pdfs);
      router.push("/pdf-editor");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        className="landing-upload-button disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Upload PDF to editor"
      >
        {children}
      </button>
    </>
  );
}
