import { ComingNext } from "@/components/shell/ComingNext";
import { ROLE_NAV } from "@/lib/nav";

const item = ROLE_NAV.ops_admin.find((n) => n.href === "/ops/schedule")!;

export default function Page() {
  return <ComingNext item={item} />;
}
