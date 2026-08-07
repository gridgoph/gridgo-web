import { RoleGate } from "@/components/shell/RoleGate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGate allow="super_admin">{children}</RoleGate>;
}
