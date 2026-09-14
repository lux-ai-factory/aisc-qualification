import type {
  OntologyExtracted,
  OntologyPatch,
  OntologyView,
} from "@/domain/OntologyView";
import type { QualificationExport } from "./QualificationExporter";

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
export class OntologyClient {
  constructor(
    private readonly serviceUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(): OntologyClient {
    const url = process.env.ONTOLOGY_SERVICE_URL;
    if (!url) {
      throw new Error("ONTOLOGY_SERVICE_URL is not configured on the server.");
    }
    return new OntologyClient(url);
  }

  async build(
    qualification: QualificationExport,
    extracted?: OntologyExtracted | null,
    patch?: OntologyPatch | null,
  ): Promise<OntologyBuild> {
    const res = await this.fetchImpl(`${this.serviceUrl}/build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        qualification,
        ...(extracted ? { extracted } : {}),
        ...(patch ? { patch } : {}),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await OntologyClient.detail(res);
      // 422 is our own mistake (a bad VAIR term, an unknown picker id): the
      // service's message is the useful one, so surface it as-is.
      if (res.status === 422) throw new Error(detail);
      throw new Error(`Ontology service error ${res.status}: ${detail}`);
    }

    return (await res.json()) as OntologyBuild;
  }

  /** The VAIR terms a reviewer may pick, per AIRO class. */
  async vocabularies(): Promise<Record<string, string[]>> {
    const res = await this.fetchImpl(`${this.serviceUrl}/vocabularies`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Ontology service error ${res.status}`);
    }
    return (await res.json()) as Record<string, string[]>;
  }

  private static async detail(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) return body.detail;
      return JSON.stringify(body);
    } catch {
      return await res.text().catch(() => "");
    }
  }
}
