import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Nothing in form assembly calls a model: search, overlap hints, import and
// coverage are all deterministic. A source scan, like oneSystemEntryPoints.test.ts.

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.tsx?$/.test(name)
        ? [path]
        : [];
  });
}

// The file list is the question-set and questionnaire modules; the /forms pages are redirects.
const REQUIRED = [
  "src/domain/forms/annexPoints.ts",
  "src/domain/forms/blocks.ts",
  "src/domain/forms/types.ts",
  "src/domain/forms/legacy.ts",
  "src/domain/forms/questionSetDraft.ts",
  "src/domain/forms/setEditorState.ts",
  "src/domain/forms/questionnaireDraft.ts",
  "src/domain/forms/builderState.ts",
  "src/domain/forms/library.ts",
  "src/domain/forms/chooser.ts",
  "src/domain/forms/moveCard.ts",
  "src/domain/forms/references.ts",
  "src/domain/forms/useOnceName.ts",
  "src/server/services/QuestionSetService.ts",
  "src/server/services/QuestionnaireService.ts",
  "src/server/services/QuestionnaireFileClient.ts",
  "src/server/services/FormExportClient.ts",
  "src/server/services/FormImportClient.ts",
  "src/server/repositories/QuestionSetRepository.ts",
  "src/server/repositories/QuestionnaireRepository.ts",
  "src/server/access/callerName.ts",
  "src/app/p/[project]/system/edit/FormChooser.tsx",
  "src/app/p/[project]/RetireButton.tsx",
  "src/app/p/[project]/FormLine.tsx",
  "src/app/p/[project]/question-sets/page.tsx",
  "src/app/p/[project]/question-sets/actions.ts",
  "src/app/p/[project]/question-sets/QuestionSetEditor.tsx",
  "src/app/p/[project]/question-sets/new/page.tsx",
  "src/app/p/[project]/question-sets/[setId]/page.tsx",
  "src/app/p/[project]/question-sets/[setId]/edit/page.tsx",
  "src/app/p/[project]/question-sets/[setId]/export/route.ts",
  "src/app/p/[project]/question-sets/import/page.tsx",
  "src/app/p/[project]/question-sets/import/actions.ts",
  "src/app/p/[project]/question-sets/import/QuestionSetImport.tsx",
  "src/app/p/[project]/questionnaires/page.tsx",
  "src/app/p/[project]/questionnaires/actions.ts",
  "src/app/p/[project]/questionnaires/QuestionnaireBuilder.tsx",
  "src/app/p/[project]/questionnaires/libraryData.ts",
  "src/app/p/[project]/questionnaires/new/page.tsx",
  "src/app/p/[project]/questionnaires/[questionnaireId]/edit/page.tsx",
  "src/app/p/[project]/questionnaires/[questionnaireId]/export/route.ts",
  "src/app/p/[project]/questionnaires/import/page.tsx",
  "src/app/p/[project]/questionnaires/import/actions.ts",
  "src/app/p/[project]/questionnaires/import/QuestionnaireImport.tsx",
];

const files = () => [
  ...new Set([
    ...REQUIRED,
    ...sources("src/domain/forms"),
    ...sources("src/app/p/[project]/question-sets"),
    ...sources("src/app/p/[project]/questionnaires"),
  ]),
];

describe("form assembly calls no model", () => {
  it("every module the spec lists exists (so the scan below is not vacuous)", () => {
    const missing = REQUIRED.filter((f) => !existsSync(f));
    expect(missing).toEqual([]);
  });

  it("none imports the filler or the LLM service", () => {
    const offending = files()
      .filter(existsSync)
      .filter((f) =>
        /FillerClient|services\/llm|from ["'][^"']*\/llm["']/.test(
          readFileSync(f, "utf8"),
        ),
      );
    expect(offending).toEqual([]);
  });

  // The prefill service token is a service-to-service token, not a model credential, so it is
  // allowed. NEXT_BASE_PATH is allowed because the library pages build links with the base path.
  it("the only environment names any of them reads are PREFILL_URL, PLATFORM_URL, NEXT_BASE_PATH and QUALIFICATION_WEB_TO_PREFILL_TOKEN", () => {
    const allowed = [
      "PREFILL_URL",
      "PLATFORM_URL",
      "NEXT_BASE_PATH",
      "QUALIFICATION_WEB_TO_PREFILL_TOKEN",
    ];
    const read = files()
      .filter(existsSync)
      .flatMap((f) =>
        [
          ...readFileSync(f, "utf8").matchAll(
            /process\.env(?:\.([A-Za-z0-9_]+)|\[["']([A-Za-z0-9_]+)["']\])/g,
          ),
        ]
          .map((m) => m[1] ?? m[2])
          .filter((name) => !allowed.includes(name))
          .map((name) => `${f}: ${name}`),
      );
    expect(read).toEqual([]);
  });

  it("the modules the two-level forms replaced are gone", () => {
    for (const f of [
      "src/domain/forms/formDraft.ts",
      "src/server/services/FormService.ts",
      "src/server/repositories/FormRepository.ts",
      "src/app/p/[project]/forms/FormBuilder.tsx",
      "src/app/p/[project]/forms/actions.ts",
      "src/app/p/[project]/forms/libraryData.ts",
      "src/app/p/[project]/forms/import/FormImport.tsx",
      "src/app/p/[project]/forms/import/actions.ts",
      "src/app/p/[project]/forms/page.tsx",
      "src/app/p/[project]/forms/[formId]/export/route.ts",
    ]) {
      expect(existsSync(f), f).toBe(false);
    }
  });
});
