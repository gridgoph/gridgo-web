import { RoleGate } from "@/components/shell/RoleGate";

export default function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGate allow="ops_admin">{children}</RoleGate>;
}
