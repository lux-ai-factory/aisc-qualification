import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { RISK_FIELDS } from "@/data/riskFields";
import { AFFECTED, IMPACT_AREAS, LOCALITIES, MARKET_FORMS } from "@/data/airoVocab";
import { OntologyClient } from "@/server/services/OntologyClient";
import Methodology, { type MethodologyFacts } from "./Methodology";

export const metadata = {
  title: "Methodology",
  description:
    "How a qualification becomes an AI card: the EU AI Act questions, the AIRO ontology, the VAIR vocabulary, and the knowledge graph they produce.",
};

export default async function MethodologyPage() {
  // Counted from the same data the form is built from, so the page cannot drift
  // from it. The vocabulary counts come from the ontology service; if it is down
  // the page drops those sentences rather than failing or guessing.
  let vocabulary: MethodologyFacts["vocabulary"] = null;
  try {
    const terms = await OntologyClient.fromEnv().vocabularies();
    const lists = Object.values(terms);
    vocabulary = {
      classes: lists.length,
      terms: lists.reduce((n, list) => n + list.length, 0),
      typed: lists.filter((list) => list.length > 0).length,
    };
  } catch {
    vocabulary = null;
  }

  const facts: MethodologyFacts = {
    questions: KEY_QUESTIONS.length,
    optionalQuestions: KEY_QUESTIONS.filter((q) => q.optional).length,
    riskFields: RISK_FIELDS.length,
    pickers: {
      marketForm: MARKET_FORMS.length,
      locality: LOCALITIES.length,
      impactArea: IMPACT_AREAS.length,
      affected: AFFECTED.length,
    },
    // The minimal AIRO subset, as services/ontology/airo_min/schema.py holds it.
    // Asserted against that file by services/ontology/tests/test_schema.py.
    schema: { classes: 19, properties: 19 },
    vocabulary,
  };

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>Methodology</h1>
        <p>
          Eight steps from a filled form to an AI card you can download, each
          with what goes in, the text that authorises it and what comes out.
        </p>
      </header>
      <Methodology facts={facts} />
    </main>
  );
}
