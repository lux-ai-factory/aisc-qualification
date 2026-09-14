import Link from "next/link";
import type { ReactNode } from "react";

import BafDiagram from "./BafDiagram";

// The method, as a procedure: seven steps, each with what goes in, the text that
// authorises it and what comes out. It reads as a procedure because that is what
// it is, and because a reader checking whether the app did the right thing needs
// to follow it step by step rather than take a paragraph's word for it.
//
// Both ontologies are CC BY 4.0, which requires attribution: title, author,
// source and licence, each with a link. That is not decoration here, it is the
// licence condition, so the attribution blocks are the part of this page that
// must not be edited away.
//
// Every number is passed in, computed from the data files and the running
// ontology service. A methodology page that states counts by hand goes stale
// silently, which is the one thing it must not do.
export type MethodologyFacts = {
  questions: number;
  optionalQuestions: number;
  riskFields: number;
  pickers: Record<string, number>;
  schema: { classes: number; properties: number };
  /** null when the ontology service could not be reached. */
  vocabulary: { classes: number; terms: number; typed: number } | null;
};

//: The strip at the top of the page: the first word of each step's title, in
//: order. Kept next to the steps and asserted against them, because a summary
//: must not drift from the steps it summarises.
const STEP_LABELS = [
  "Answer",
  "Tag",
  "Describe",
  "Build",
  "Type",
  "Draft",
  "Review",
  "Export",
] as const;

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const ACT = "https://eur-lex.europa.eu/eli/reg/2024/1689/oj";

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Step({
  title,
  what,
  input,
  authority,
  output,
  children,
}: {
  title: string;
  what: ReactNode;
  input: ReactNode;
  authority: ReactNode;
  output: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li>
      <h3>{title}</h3>
      <p>{what}</p>
      <dl className="method-io">
        <dt>Input</dt>
        <dd>{input}</dd>
        <dt>Authority</dt>
        <dd className="method-authority">{authority}</dd>
        <dt>Output</dt>
        <dd>{output}</dd>
      </dl>
      {children}
    </li>
  );
}

export default function Methodology({ facts }: { facts: MethodologyFacts }) {
  const { vocabulary } = facts;

  return (
    <div className="method">
      <ol className="method-pipe" aria-label="The eight steps">
        {STEP_LABELS.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ol>

      <section className="qf-section">
        <h2 className="qf-group">The procedure</h2>
        <ol className="method-steps">
          <Step
            title="Answer the Annex IV questions"
            what={
              <>
                {facts.questions} questions, each carrying the Annex sub-item it
                comes from. {facts.optionalQuestions} are optional, because the
                Annex qualifies them with &ldquo;where applicable&rdquo;.
              </>
            }
            input="Free text, written by the provider."
            authority={
              <>
                <A href={ACT}>Regulation (EU) 2024/1689</A>, Annex IV points 1
                and 2 (technical documentation).
              </>
            }
            output="One stored answer per question, with its citation."
          />
          <Step
            title="Tag what the system is and where it runs"
            what="Closed pickers rather than free text, so these answers can type nodes directly."
            input={
              <>
                Capabilities and sectors from the taxonomies; how it reaches the
                market ({facts.pickers.marketForm} options), where it is used (
                {facts.pickers.locality}).
              </>
            }
            authority="Art 3(1) and 3(12) for purpose and capability, Art 6(1) and Annex IV 1(d) for market form, Art 3(44) and Art 5(1)(f) for locality."
            output="Tag ids, each mapped to one AIRO class."
          />
          <Step
            title="Describe each risk as a chain"
            what={`One row per risk, ${facts.riskFields} fields: what could go wrong, what causes it, which weakness it exploits, what follows, who and what it affects, the control, and the control that follows if it is not enough.`}
            input="One row per risk, written by the provider."
            authority="Art 9(2) for the risk, its cause and its control; Art 15(5) for the weakness exploited; Art 9(5) and Art 14(4)(e) for the follow-up control; Art 9(9) for who is affected."
            output="A risk row, in the order AIRO's risk chain expects."
          />
          <Step
            title="Build the graph"
            what={
              <>
                The answers become individuals and relations conforming to
                AIRO: an{" "}
                <code>AISystem</code> that <code>hasPurpose</code>,{" "}
                <code>hasCapability</code>, <code>isProvidedBy</code> and{" "}
                <code>hasRisk</code>; a <code>Risk</code> that{" "}
                <code>hasConsequence</code>, which <code>hasImpact</code>, which{" "}
                <code>hasImpactOnStakeholder</code>.
              </>
            }
            input="The stored answers, tags and risk rows."
            authority={
              <>
                <A href="https://w3id.org/airo">AIRO 1.0</A>, core concepts and
                relations (its section 3.1, Figure 3): {facts.schema.classes}{" "}
                classes and {facts.schema.properties} properties of AIRO&rsquo;s
                46 and 52.
              </>
            }
            output="This system's knowledge graph, valid against AIRO's domains and ranges."
          >
            <p>
              AIRO gives the card its shape and says nothing about which
              purposes or risks exist in the world. That is the next
              step&rsquo;s job.
            </p>
            <Attribution
              title="AIRO, AI Risk Ontology, version 1.0"
              authors="Delaram Golpayegani, Harshvardhan J. Pandit, Dave Lewis"
              publisher="ADAPT Centre, Trinity College Dublin"
              namespace="https://w3id.org/airo"
              repo="https://github.com/DelaramGlp/airo"
              doi="https://doi.org/10.5281/zenodo.10894750"
              citation="Golpayegani, Pandit, Lewis. AIRO: An ontology for representing AI risks based on the proposed EU AI Act and ISO risk management standards. Towards a Knowledge-Aware AI, IOS Press, 2022, 51-65."
            />
          </Step>
          <Step
            title="Type the nodes from the vocabulary"
            what={
              <>
                Each node keeps its AIRO class and takes a VAIR term as a second
                type when one describes it. A term is accepted only if VAIR
                defines it under that node&rsquo;s own class, so{" "}
                <code>vair:Police</code> cannot land on a <code>Purpose</code>.
              </>
            }
            input="Tag mappings, plus terms proposed from the prose answers."
            authority={
              <>
                <A href="https://w3id.org/vair">VAIR 1.0</A>
                {vocabulary
                  ? `: ${vocabulary.terms} terms across ${vocabulary.classes} classes, ${vocabulary.typed} of which VAIR subdivides at all.`
                  : " (term counts unavailable: the ontology service is down)."}
              </>
            }
            output="Typed nodes; untyped ones where VAIR defines no term that fits."
          >
            <p>
              A VAIR term declares an AIRO class as its parent, and that
              subclassing is the whole bridge between the two:
            </p>
            <pre className="method-code">{`vair:EUAgency  rdf:type rdfs:Class, owl:Class ;
               rdfs:subClassOf airo:AIOperator .`}</pre>
            <p>
              The taxonomy nests, which matters when reading it:{" "}
              <code>vair:Police</code> reaches <code>airo:AIOperator</code>{" "}
              through <code>vair:EmergencyServiceProvider</code>, so a
              class&rsquo;s terms include its grandchildren. Where no term fits,
              the node keeps its class and says so: VAIR defines none for{" "}
              <code>Risk</code>, <code>Vulnerability</code> or{" "}
              <code>AIUser</code>, and its <code>AIOperator</code> terms are all
              Annex III public bodies, so a commercial provider has none.
            </p>
            <Attribution
              title="VAIR, Vocabulary of AI Risks, version 1.0"
              authors="Delaram Golpayegani, Harshvardhan J. Pandit, Dave Lewis"
              publisher="ADAPT Centre, Trinity College Dublin"
              namespace="https://w3id.org/vair"
              repo="https://github.com/DelaramGlp/vair"
              doi="https://doi.org/10.5281/zenodo.10894914"
              citation="Golpayegani, Pandit, Lewis. To Be High-Risk, or Not To Be: Semantic Specifications and Implications of the AI Act's High-Risk AI Applications and Harmonised Standards. Proceedings of the 2023 ACM Conference on Fairness, Accountability, and Transparency, 2023."
            />
          </Step>
          <Step
            title="Draft what the prose answers support"
            what={
              <>
                Two properties cannot come from a picker, because the answers
                they come from are paragraphs: the techniques behind Annex IV
                2(a) and the components behind 2(c). A small workflow reads
                them, drafts nodes, reviews its own draft, and publishes it for
                you to edit.
              </>
            }
            input="The prose answers, and the term list for each property."
            authority={
              <>
                Annex IV 2(a) and 2(c) for what is read; the loop itself runs on
                the{" "}
                <A href="https://github.com/BESSER-PEARL/BESSER-Agentic-Framework">
                  BESSER Agentic Framework
                </A>{" "}
                (MIT, by LIST), which holds the states and records the rounds.
              </>
            }
            output="Drafted nodes, each carrying any finding the loop could not settle."
          >
            <BafDiagram />
            <ol className="method-loop">
              <li>
                <h3>Draft</h3>
                <p>
                  A model is given one answer, the terms valid for that
                  property, and the same written rule a person would follow. It
                  proposes names and terms, nothing else: it never writes to the
                  graph itself.
                </p>
              </li>
              <li>
                <h3>Controls</h3>
                <p>
                  Deterministic checks, no model involved, cheapest first: is
                  the term one VAIR defines for this class, is the label a name
                  rather than a sentence, do its words appear in the answer, are
                  two nodes saying the same thing, was an answer with content
                  left empty.
                </p>
              </li>
              <li>
                <h3>Critic</h3>
                <p>
                  Only if the controls pass. A second model reads the answer and
                  the draft, not the draft&rsquo;s justification, and raises at
                  most one finding per node, quoting the span of the answer it
                  relies on. This is the part no string comparison can do: words
                  that are all in the answer but mean something else there.
                </p>
              </li>
              <li>
                <h3>Revise</h3>
                <p>
                  Only the nodes a finding named go back to the writer, with the
                  finding attached. Everything nobody objected to stays as it
                  was.
                </p>
              </li>
              <li>
                <h3>Publish</h3>
                <p>
                  The draft is written with{" "}
                  <code>provenance: &ldquo;extracted&rdquo;</code>, and whatever
                  the loop could not settle rides along as a flag on the node:{" "}
                  <code>ungrounded</code>, <code>inflated</code>,{" "}
                  <code>sentence</code>, <code>unsupported-term</code> or{" "}
                  <code>uncovered</code>.
                </p>
              </li>
            </ol>

            <h4 className="method-subhead">Where the loop stops</h4>
            <p>
              Four rules, and <strong>every exit publishes</strong>. A draft
              that failed review is worth more in the graph, carrying its
              findings, than discarded: the graph is where you edit it, which is
              the next step.
            </p>
            <div className="method-table-wrap">
              <table className="method-stops">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Fires when</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>clean</code>
                    </td>
                    <td>no control and no critic finding</td>
                    <td>published unflagged</td>
                  </tr>
                  <tr>
                    <td>
                      <code>fixpoint</code>
                    </td>
                    <td>
                      the same node and flag raised two rounds running: the
                      writer will not fix what the critic will not drop
                    </td>
                    <td>published flagged, for you to settle</td>
                  </tr>
                  <tr>
                    <td>
                      <code>cap</code>
                    </td>
                    <td>three rounds, still finding new things</td>
                    <td>published flagged</td>
                  </tr>
                  <tr>
                    <td>
                      <code>budget</code>
                    </td>
                    <td>the call limit for one property</td>
                    <td>
                      published flagged, and the record says it stopped early
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="method-note">
              Each run records what it cost and what it left: rounds taken,
              findings raised and fixed, calls made.
            </p>
          </Step>
          <Step
            title="Review and correct, node by node"
            what={
              <>
                Your turn. Rename a node, change its term, or record that none
                of the terms applies. A flagged node is the queue: editing it
                records that you looked, stamps it reviewed and clears the flag.
                The generated value is kept beside your correction, and a re-run
                of the workflow cannot overwrite it.
              </>
            }
            input="The built graph, its flags, and a reviewer."
            authority="Art 14 (human oversight) applied to the documentation itself: a claim on the card is a person's, or it is marked as generated."
            output="The same graph, with provenance on every node: from the form, extracted, or reviewed."
          />
          <Step
            title="Export the card"
            what="The graph is the card, so it leaves as one. Re-parsing the JSON-LD reconstructs it triple for triple, corrections included."
            input="The reviewed graph."
            authority="Annex IV (the documentation the provider must keep and be able to hand over)."
            output="JSON-LD, Turtle, and a PDF rendering of the same graph."
          />
        </ol>
      </section>

      <section className="qf-section">
        <h2 className="qf-group">Limits of the procedure</h2>
        <ol className="method-limits">
          <li>
            <strong>
              It does not decide whether your system is high-risk.
            </strong>{" "}
            The procedure records what Annex IV asks you to document. Annex III
            classification is a legal judgement and the app neither makes it nor
            implies it.
          </li>
          <li>
            It is not legal advice, and a completed card is not a conformity
            assessment or a declaration of conformity.
          </li>
          <li>
            It covers Annex IV points 1 and 2. Points 3 to 9 are not asked yet.
          </li>
          <li>
            It does not run AIRO&rsquo;s Annex III SHACL classifier. As
            published, none of its 103 property shapes carries a{" "}
            <code>sh:minCount</code>, so every system matches all 28 high-risk
            shapes.
          </li>
        </ol>
      </section>

      <p className="method-back">
        <Link href="/">Back to home</Link>
      </p>
    </div>
  );
}

/** The CC BY attribution block: title, author, source, licence, each linked. */
function Attribution({
  title,
  authors,
  publisher,
  namespace,
  repo,
  doi,
  citation,
}: {
  title: string;
  authors: string;
  publisher: string;
  namespace: string;
  repo: string;
  doi: string;
  citation: string;
}) {
  return (
    <div className="method-attrib">
      <h3>{title}</h3>
      <p>
        {authors}. {publisher}.
      </p>
      <p>
        <A href={namespace}>{namespace}</A> ·{" "}
        <A href={repo}>source repository</A> · <A href={doi}>DOI</A>
      </p>
      <p className="method-cite">{citation}</p>
      <p>
        Licensed <A href={CC_BY}>CC BY 4.0</A>, vendored unmodified.
      </p>
    </div>
  );
}
