import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitials } from "@/lib/auth/clerk-profile";

export function ChatAvatar({
  name,
  imageUrl,
  size = "sm",
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const photo = imageUrl?.trim() || undefined;
  return (
    <Avatar
      size={size}
      className={className}
      aria-label={photo ? `${name}, profile photo` : name}
    >
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback>{displayInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
