/**
 * Reading an uploaded document into the form's answers.
 *
 * The reading itself is the prefill service's job, in Python: the Annex
 * headings and the labels people write are what it matches, and it needs no
 * model. This carries the file there and the answers back.
 *
 * It never throws. A service that is down, or not deployed at all, means the
 * form opens empty and the person types.
 */
import type { ComponentExample, RiskExample } from "@/data/examples";
import { serviceTokenHeaders, serviceUrl } from "@/server/services/http";
import type { PrefillFormSpec } from "@/lib/prefillChoice";

export type { PrefillFormSpec };

export type PrefillMode = "empty" | "replace";

export type PrefillValues = Record<string, string>;

/** One risk row, as the form's rows hold it (question 15). */
export type PrefillRisk = RiskExample;

/** One row of the Components block, as the form holds it. */
export type PrefillComponent = ComponentExample;

/** The VAIR picks a document names, as VAIR ids; a field it names none for is absent. */
export type PrefillPicks = {
  systemType?: string;
  purpose?: string;
  providerTerm?: string;
  deployerTerm?: string;
  targetSystemTags?: string[];
  sectorTags?: string[];
  marketFormTags?: string[];
  localityTags?: string[];
};

export type PrefillResult =
  | {
      ok: true;
      /** the form's answers after the merge */
      values: PrefillValues;
      /** what this upload wrote */
      filled: string[];
      /** what it left as it was */
      kept: string[];
      /** whether a model contributed, and which */
      model: string | null;
      /** the risk rows the form should show, or null to leave its rows alone */
      risks: PrefillRisk[] | null;
      /** whether rows somebody wrote were kept */
      risksKept: boolean;
      /** how many risks the document has, used or not */
      risksProposed: number;
      /** the Components block's rows to show, or null to leave them alone */
      components?: PrefillComponent[] | null;
      componentsKept?: boolean;
      componentsProposed?: number;
      /** the VAIR picks the document names; the form applies them by the mode's rule */
      picks?: PrefillPicks;
      picksProposed?: number;
    }
  | { ok: false; error: string };

export class PrefillClient {
  constructor(
    private readonly baseUrl: string = process.env.PREFILL_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the prefill service: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_PREFILL_TOKEN ?? "",
  ) {}

  async read(
    file: File,
    mode: PrefillMode = "empty",
    current: PrefillValues = {},
    currentRisks: PrefillRisk[] = [],
    formSpec?: PrefillFormSpec,
    currentComponents: PrefillComponent[] = [],
  ): Promise<PrefillResult> {
    if (!this.baseUrl) {
      return { ok: false, error: "Reading documents is not available on this install." };
    }
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    body.set("current", JSON.stringify(current));
    body.set("current_risks", JSON.stringify(currentRisks));
    body.set("current_components", JSON.stringify(currentComponents));
    // Without a form spec the service reads against the default form.
    if (formSpec) {
      body.set("fields", JSON.stringify(formSpec.fields));
      body.set("questions", JSON.stringify(formSpec.questions));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(serviceUrl(this.baseUrl, "/prefill"), {
        method: "POST",
        headers: serviceTokenHeaders(this.serviceToken),
        body,
        cache: "no-store",
      });
    } catch {
      return { ok: false, error: "The document reader could not be reached." };
    }
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body) => (body as { detail?: string }).detail)
        .catch(() => undefined);
      return { ok: false, error: detail ?? `The document could not be read (${response.status}).` };
    }
    const body_ = (await response.json()) as {
      values: PrefillValues;
      filled: string[];
      kept: string[];
      model: string | null;
      risks?: PrefillRisk[] | null;
      risksKept?: boolean;
      risksProposed?: number;
      components?: PrefillComponent[] | null;
      componentsKept?: boolean;
      componentsProposed?: number;
      picks?: PrefillPicks;
      picksProposed?: number;
    };
    return {
      ok: true,
      values: body_.values,
      filled: body_.filled,
      kept: body_.kept,
      model: body_.model,
      // An older prefill service omits the risk fields.
      risks: body_.risks ?? null,
      risksKept: body_.risksKept ?? false,
      risksProposed: body_.risksProposed ?? 0,
      // An older service omits the component fields too.
      components: body_.components ?? null,
      componentsKept: body_.componentsKept ?? false,
      componentsProposed: body_.componentsProposed ?? 0,
      // and the picks.
      picks: body_.picks ?? {},
      picksProposed: body_.picksProposed ?? 0,
    };
  }
}

export const prefillClient = new PrefillClient();
