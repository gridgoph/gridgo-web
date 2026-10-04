import { FileDeletionAccessProvider } from "@/components/files/FileDeletionAccess";
import { RoleGate } from "@/components/shell/RoleGate";

export default function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Operations reads who deleted a file and why; it never deletes one.
  return (
    <RoleGate allow="ops_admin">
      <FileDeletionAccessProvider readRecord>{children}</FileDeletionAccessProvider>
    </RoleGate>
  );
}
