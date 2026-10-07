"use client";

import { useRef } from "react";
import { File } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ChatAttachButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
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
        aria-label="Add photos"
        onClick={() => inputRef.current?.click()}
      >
        <File />
      </Button>
    </>
  );
}
