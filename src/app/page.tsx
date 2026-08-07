import { redirect } from "next/navigation";

/** Middleware handles role landing; this is a safe fallback. */
export default function HomePage() {
  redirect("/login");
}
