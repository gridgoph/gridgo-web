/**
 * The listing editor's section numbers, derived from where each section sits
 * so two sections can never share one. A step with one section reads as the
 * step ("03"); a step with several numbers them in order ("06.1", "06.2").
 */
export function sectionNumber(
  steps: readonly (readonly string[])[],
  sectionId: string,
): string {
  const stepIndex = steps.findIndex((sections) => sections.includes(sectionId));
  if (stepIndex < 0) return "";
  const step = String(stepIndex + 1).padStart(2, "0");
  const sections = steps[stepIndex];
  return sections.length > 1 ? `${step}.${sections.indexOf(sectionId) + 1}` : step;
}
