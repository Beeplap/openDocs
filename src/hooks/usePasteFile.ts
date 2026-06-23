import React from "react";

export function usePasteFile(onFilesSelected: (files: File[], fileList: FileList) => void, disabled: boolean = false) {
  React.useEffect(() => {
    if (disabled) return;

    function handlePaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        onFilesSelected(files, e.clipboardData.files);
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFilesSelected, disabled]);
}
