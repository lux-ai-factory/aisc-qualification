import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadSrc } from "../support/forms";
import { mcasCard } from "../support/mcasCard";

// An Annex IV card exports the same answers and form header as it did before question sets
// and questionnaires.
//
// test/fixtures/mcas-export-before.json is
//   JSON.stringify(toExport(mcasCard(), annexDefaultVersion()), null, 2)
// as written by the one-level forms code. The same card and today's annexDefaultVersion()
// export the same bytes, except that each form.questions[] entry's owner keys are renamed:
// ownerForm -> ownerSet "Annex IV", ownerFormId -> ownerSetId "annex-iv", in the key order key,
// text, citation, required, annexPoint, ownerSet, ownerSetId, ownerBuiltin.

const FIXTURE = "test/fixtures/mcas-export-before.json";

type Q = Record<string, unknown>;
const before = () => JSON.parse(readFileSync(FIXTURE, "utf8"));

// The form speaks VAIR: the export carries the VAIR terms the author chose instead of resolved
// tags. That is the one other change
// to these bytes, and its values come from the ontology's own MCAS fixture, not from the exporter.
const VAIR_EXAMPLE = JSON.parse(readFileSync("services/ontology/examples/mcas.qualification.json", "utf8"));
const RISK_TERMS = ["sourceTerm", "consequenceTerm", "impactTerm", "controlTerm", "followUpControlTerm"];

function inVair(x: Q): Q {
  const { targetSystems: _t, sectors: _s, marketFormTags: _m, localityTags: _l, answers, risks, ...rest } = x;
  void _t; void _s; void _m; void _l;
  const head = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "form"));
  return {
    ...head,
    systemType: VAIR_EXAMPLE.systemType,
    purpose: VAIR_EXAMPLE.purpose,
    providerTerm: null,
    deployerTerm: null,
    targetSystemTags: VAIR_EXAMPLE.targetSystemTags,
    sectorTags: VAIR_EXAMPLE.sectorTags,
    marketFormTags: VAIR_EXAMPLE.marketFormTags,
    localityTags: VAIR_EXAMPLE.localityTags,
    answers,
    risks: (risks as Q[]).map((r, i) => {
      const terms = VAIR_EXAMPLE.risks[i];
      return {
        position: r.position, risk: r.risk, source: r.source, sourceTerm: terms.sourceTerm,
        vulnerability: r.vulnerability, consequence: r.consequence, consequenceTerm: terms.consequenceTerm,
        impactTerm: terms.impactTerm, affected: terms.affected, impactAreas: terms.impactAreas, control: r.control,
        controlTerm: terms.controlTerm, followUpControl: r.followUpControl, followUpControlTerm: terms.followUpControlTerm,
      };
    }),
    form: x.form,
  };
}

/** The fixture as the code must write it: the owner keys of each question are renamed, and the
 *  tags are VAIR terms. */
function expectedAfter() {
  const x = before();
  x.form.questions = x.form.questions.map((q: Q) => ({
    key: q.key,
    text: q.text,
    citation: q.citation,
    required: q.required,
    annexPoint: q.annexPoint,
    ownerSet: "Annex IV",
    ownerSetId: "annex-iv",
    ownerBuiltin: q.ownerBuiltin,
  }));
  return inVair(x);
}

async function exportNow() {
  const { toExport } = await loadSrc("server/services/QualificationExporter.ts");
  const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
  return toExport(mcasCard(), annexDefaultVersion());
}

describe("the fixture written before the change (T10)", () => {
  it("T10 is JSON.stringify(x, null, 2) of an export of the Annex IV default with 14 questions owned by the old form", () => {
    const text = readFileSync(FIXTURE, "utf8");
    const x = JSON.parse(text);
    expect(JSON.stringify(x, null, 2)).toBe(text);
    expect(x.form).toMatchObject({ name: "Annex IV default", version: 1 });
    expect(x.form.questions).toHaveLength(14);
    for (const q of x.form.questions) {
      expect(Object.keys(q)).toEqual([
        "key", "text", "citation", "required", "annexPoint", "ownerForm", "ownerFormId", "ownerBuiltin",
      ]);
      expect(q).toMatchObject({ ownerForm: "Annex IV default", ownerFormId: "annex-iv-default", ownerBuiltin: true });
    }
    expect(x.answers).toHaveLength(14);
  });
});

describe("an Annex IV card exports as before (T10)", () => {
  it("T10 toExport(the MCAS card, annexDefaultVersion()) is the fixture byte for byte, owner keys renamed", async () => {
    const now = await exportNow();
    expect(JSON.stringify(now, null, 2)).toBe(JSON.stringify(expectedAfter(), null, 2));
  });

  it("T10 answers, their order, form.name, form.version, metadata and risks are the fixture's", async () => {
    const now = await exportNow();
    const was = inVair(before()) as ReturnType<typeof before>;
    expect(now.answers).toEqual(was.answers);
    expect(now.form.name).toBe("Annex IV default");
    expect(now.form.version).toBe(1);
    expect(now.risks).toEqual(was.risks);
    for (const f of RISK_TERMS) expect(now.risks.map((r: Q) => r[f]), f).toEqual(VAIR_EXAMPLE.risks.map((r: Q) => r[f]));
    const { form: _a, ...restNow } = now;
    const { form: _b, ...restWas } = was;
    void _a;
    void _b;
    expect(restNow).toEqual(restWas);
  });

  it("T10 T43 each question's keys are key, text, citation, required, annexPoint, ownerSet, ownerSetId, ownerBuiltin, in that order", async () => {
    const now = await exportNow();
    for (const q of now.form.questions) {
      expect(Object.keys(q)).toEqual([
        "key", "text", "citation", "required", "annexPoint", "ownerSet", "ownerSetId", "ownerBuiltin",
      ]);
      expect(q).toMatchObject({ ownerSet: "Annex IV", ownerSetId: "annex-iv", ownerBuiltin: true });
    }
  });
});
