// The card's view of a filled AIRO graph. Computed by the ontology service
// (services/ontology/airo_min/view.py), so this file is a type mirror only:
// there is no graph logic in the app.

export type Provenance = "form" | "extracted" | "reviewed";

export type OntologyNode = {
  /** Local name in the graph, and the key a patch uses. */
  id: string;
  /** A name, at most 60 characters. */
  label: string;
  /** The AIRO class, one of the minimal schema's 19. */
  cls: string | null;
  /** The VAIR term, or null when nothing in VAIR applies (flagged in the UI). */
  vair: string | null;
  /** The full source text, when the label was shortened from it. */
  fullText: string | null;
  provenance: Provenance;
  /** Present once a reviewer has changed the label. */
  generatedLabel?: string;
  /** Present once a reviewer has justified a change. */
  reviewNote?: string;
  /** A reviewer determined the vocabulary has no term that fits this node. */
  termNotApplicable?: boolean;
  /** Findings the filler's own review could not settle, from the closed set in
   *  airo_min/build.py. A reviewer's edit clears them. */
  flags?: string[];
  /** False when the class has VAIR terms but they name a population this node
   *  does not belong to: VAIR's 17 AIOperator terms are all Annex III public
   *  bodies, so a commercial provider is complete without one. Absent means a
   *  term is expected, and its absence is a gap worth flagging. */
  termExpected?: boolean;
  /** The form tag this node came from, for taxonomy-fed nodes. */
  formTag?: string;
  /** The Annex IV sub-item a prose-fed node was extracted from. */
  derivedFrom?: string;
};

/** One property of the AI system, with the AI Act provision behind it. */
export type OntologyRow = {
  property: string;
  label: string;
  citation: string;
  nodes: OntologyNode[];
};

/** One risk, as AIRO's chain: source and weakness through to impact and controls. */
export type OntologyChain = {
  risk: OntologyNode;
  source: OntologyNode | null;
  vulnerability: OntologyNode | null;
  consequence: OntologyNode | null;
  impact: OntologyNode | null;
  stakeholder: OntologyNode | null;
  areas: OntologyNode[];
  control: OntologyNode | null;
  followUp: OntologyNode | null;
  citation: string;
};

/** An Annex IV answer riding along with the graph, verbatim. */
export type OntologyAnswer = {
  citation: string;
  questionId: string;
  text: string;
};

export type OntologyView = {
  system: OntologyNode;
  answers: OntologyAnswer[];
  rows: OntologyRow[];
  chains: OntologyChain[];
  counts: {
    nodes: number;
    triples: number;
    risks: number;
    reviewed: number;
    /** every node without a VAIR term. */
    untyped: number;
    /** untyped AND the class has terms available: a reviewer can act on these. */
    needsTerm: number;
    /** nodes the filler agent flagged in its own draft, still unsettled. */
    flagged: number;
    /** untyped and nothing to act on: either VAIR does not subdivide the
     *  class, or its terms name a population this node is not part of. */
    unclassifiable: number;
  };
};

/** A reviewer's correction to one node. `vair: null` removes the type. */
export type NodePatch = {
  label?: string;
  vair?: string | null;
  note?: string;
  /** Record that nothing in the class's term list applies. */
  termNotApplicable?: boolean;
};

export type OntologyPatch = Record<string, NodePatch>;

/** What an agent supplies for the two properties that live inside prose. */
export type OntologyExtracted = {
  techniques?: Array<string | { label: string; vair?: string }>;
  components?: Array<string | { label: string; vair?: string }>;
  names?: Record<string, string>;
  /** node id -> VAIR term, for nodes no mechanical mapping can reach. */
  types?: Record<string, string>;
};
