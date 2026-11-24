"use client";

import { useParams } from "next/navigation";

import { TemplateEditor } from "@/components/product-templates/team/TemplateEditor";

export default function OpsProductTemplatePage() {
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  return <TemplateEditor tree="ops" templateId={decodeURIComponent(raw || "")} />;
}
