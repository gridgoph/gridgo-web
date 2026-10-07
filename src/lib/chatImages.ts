export const SUPPORT_CHAT_IMAGE_PURPOSE = "support_chat_image";
export const SUPPORT_CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SUPPORT_CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const SUPPORT_CHAT_IMAGE_MAX_COUNT = 4;

export function validateSupportChatImage(file: File): string | null {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  const name = file.name.toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => name.endsWith(ext));
  if (!SUPPORT_CHAT_IMAGE_TYPES.includes(type as (typeof SUPPORT_CHAT_IMAGE_TYPES)[number]) || !extensionOk) {
    return "Choose a JPEG, PNG, or WebP photo.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > SUPPORT_CHAT_IMAGE_MAX_BYTES) return "Photos can be up to 15 MB.";
  return null;
}
