import { ComingNext } from "@/components/shell/ComingNext";
import { ROLE_NAV } from "@/lib/nav";

const item = ROLE_NAV.supplier.find((n) => n.href === "/supplier/capacity")!;

export default function Page() {
  return <ComingNext item={item} />;
}
