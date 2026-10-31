import type {
  OntologyExtracted,
  OntologyPatch,
  OntologyView,
} from "@/domain/OntologyView";
import type { QualificationExport } from "./QualificationExporter";
import { callService, type ServiceAnswer } from "./http";

export type OntologyBuild = {
  view: OntologyView;
  turtle: string;
  jsonld: string;
  problems: string[];
  /** The graph's identity, up to blank-node renaming: two builds of the same
   *  answers share it even though their Turtle differs. */
  digest: string;
};

/**
 * Talks to the AIRO ontology service (services/ontology) over HTTP. The graph is
 * built and validated there, in Python, and this app only renders the view model
 * it returns: no RDF library and no ontology rules on this side.
 */
/** The builder refused its input (422): a bad VAIR term, an unknown picker id. Its message is the
 *  service's own. Any other failure (the service down, a 500) is a plain Error. */
export class OntologyRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OntologyRejected";
  }
}

/** A build as the service answers it, or undefined when the answer is not one. */
function ontologyBuild(raw: unknown): OntologyBuild | undefined {
  const b = raw as Partial<OntologyBuild> | null;
  if (!b || typeof b !== "object" || !b.view || typeof b.view !== "object") return undefined;
  if (typeof b.turtle !== "string" || typeof b.jsonld !== "string") return undefined;
  return b as OntologyBuild;
}

/** The terms per AIRO class, when every class has a list of terms. */
function vocabularies(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const lists = Object.values(raw);
  return lists.every((l) => Array.isArray(l) && l.every((t) => typeof t === "string"))
    ? (raw as Record<string, string[]>)
    : undefined;
}

/** A failed call as the Error the callers catch: a 422 is the builder refusing its input. */
function failure(answer: Extract<ServiceAnswer<unknown>, { ok: false }>, call: string): Error {
  const { status, shownDetail } = answer;
  // 422 is our own mistake (a bad VAIR term, an unknown picker id): the
  // service's message is the useful one, so surface it as-is.
  if (status === 422) return new OntologyRejected(shownDetail ?? "The ontology service refused the card.");
  if (status === null || status < 300) return new Error(`Ontology service error: ${shownDetail}`);
  console.warn(`ontology: ${call} answered ${status}: ${shownDetail ?? "no detail"}`);
  return new Error(`Ontology service error ${status}${shownDetail ? `: ${shownDetail}` : ""}`);
}

export class OntologyClient {
  constructor(
    private readonly serviceUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the ontology service: it refuses a caller without one. */
    private readonly serviceToken: string = "",
  ) {}

  static fromEnv(): OntologyClient {
    const url = process.env.ONTOLOGY_SERVICE_URL;
    if (!url) {
      throw new Error("ONTOLOGY_SERVICE_URL is not configured on the server.");
    }
    return new OntologyClient(url, fetch, process.env.QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN ?? "");
  }

  async build(
    qualification: QualificationExport,
    extracted?: OntologyExtracted | null,
    patch?: OntologyPatch | null,
  ): Promise<OntologyBuild> {
    const answer = await callService({
      base: this.serviceUrl,
      path: "/build",
      method: "POST",
      token: this.serviceToken,
      body: {
        qualification,
        ...(extracted ? { extracted } : {}),
        ...(patch ? { patch } : {}),
      },
      parse: ontologyBuild,
      fetchImpl: this.fetchImpl,
    });
    if (!answer.ok) throw failure(answer, "build");
    return answer.value;
  }

  /** The VAIR terms a reviewer may pick, per AIRO class. */
  async vocabularies(): Promise<Record<string, string[]>> {
    const answer = await callService({
      base: this.serviceUrl,
      path: "/vocabularies",
      token: this.serviceToken,
      parse: vocabularies,
      fetchImpl: this.fetchImpl,
    });
    if (!answer.ok) throw failure(answer, "vocabularies");
    return answer.value;
  }
}
