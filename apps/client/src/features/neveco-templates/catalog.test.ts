import { describe, expect, it } from "vitest";
import {
  buildNevecoDraftBrief,
  buildNevecoTemplateContent,
  NEVECO_TEMPLATES,
} from "./catalog";

describe("Neveco documentation templates", () => {
  it("provides distinct MSP templates with consistent document control", () => {
    expect(NEVECO_TEMPLATES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(NEVECO_TEMPLATES.map((template) => template.id)).size)
      .toBe(NEVECO_TEMPLATES.length);

    for (const template of NEVECO_TEMPLATES) {
      const nodes = buildNevecoTemplateContent(template);
      const asText = JSON.stringify(nodes);
      expect(nodes[0].type).toBe("paragraph");
      expect(nodes[1].content?.[0].text).toBe("Document control");
      expect(asText).toContain("NEVECO / ");
      expect(asText).toContain("Customer / company:");
      expect(asText).toContain("Classification:");
      expect(asText).toContain("Status: Draft - not yet verified");
      expect(asText).toContain("Last verified:");
      expect(asText).toContain("Next review due:");
      expect(asText).toContain("Autotask / IT Glue references:");
      expect(asText).toContain("Evidence & references");
      expect(asText).toContain("Review & approval");
      expect(asText).toContain("Do not paste passwords");
      expect(nodes.filter((node) => node.type === "heading").length)
        .toBe(template.sections.length + 4);
      expect(nodes.filter((node) => node.type === "heading").every((node) => node.attrs?.level === 2))
        .toBe(true);
    }
  });

  it("uses unchecked checklists for verification", () => {
    const onboarding = NEVECO_TEMPLATES.find((entry) => entry.id === "user-onboarding")!;
    const tasks = buildNevecoTemplateContent(onboarding).filter(
      (node) => node.type === "taskList",
    );
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.flatMap((node) => node.content ?? []).every(
      (task) => task.type === "taskItem" && task.attrs?.checked === false,
    )).toBe(true);
  });

  it("limits AI drafting to supplied notes and missing-fact placeholders", () => {
    const template = NEVECO_TEMPLATES.find((entry) => entry.id === "integration")!;
    const brief = buildNevecoDraftBrief(template, "Test notes: API returns 429.");
    expect(brief).toContain("API returns 429");
    expect(brief).toContain("Use [To verify]");
    expect(brief).toContain("Only use the technician notes");
    expect(brief).toContain("Never repeat credentials");
    expect(brief).toContain("Data mapping & schedule");
    expect(brief).toContain("Do not add an H1");
  });
});
