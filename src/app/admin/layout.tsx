import { FileDeletionAccessProvider } from "@/components/files/FileDeletionAccess";
import { RoleGate } from "@/components/shell/RoleGate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Early file deletion is Super Admin's alone (gridgo-api#131).
  return (
    <RoleGate allow="super_admin">
      <FileDeletionAccessProvider deleteEarly>{children}</FileDeletionAccessProvider>
    </RoleGate>
  );
}
