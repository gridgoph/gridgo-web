"use client";

import { useRef } from "react";
import { File } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ChatAttachButton({
  disabled,
  onFiles,
  accept = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  label = "Add photos",
}: {
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled={disabled}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
      >
        <File />
      </Button>
    </>
  );
}
