"use client";

import { useEffect, useRef, useState } from "react";

/** After a refused submit, the first field to fix takes focus. */
export function useFocusFirstProblem() {
  const form = useRef<HTMLFormElement>(null);
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals)
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [refusals]);
  return { form, refuse: () => setRefusals((n) => n + 1) };
}
