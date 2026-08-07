import { RoleGate } from "@/components/shell/RoleGate";

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGate allow="supplier">{children}</RoleGate>;
}
