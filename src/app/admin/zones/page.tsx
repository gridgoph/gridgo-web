import { ComingNext } from "@/components/shell/ComingNext";
import { ROLE_NAV } from "@/lib/nav";

const item = ROLE_NAV.super_admin.find((n) => n.href === "/admin/zones")!;

export default function Page() {
  return <ComingNext item={item} />;
}
