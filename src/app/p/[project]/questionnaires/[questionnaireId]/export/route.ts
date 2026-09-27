/**
 * GET /p/<project>/questionnaires/<id>/export?format=json|csv|md[&bundle=self-contained][&version=<n>]
 *
 * A questionnaire version as a file to download (T48). `json` is the
 * questionnaire file (references by default, the wording bundled with
 * `bundle=self-contained`); `csv` and `md` flatten its questions into one
 * question list named after it. Every member may export (the route door lets a
 * reader through), from the project's own database; unlisted, retired and
 * builtin questionnaires export too. Without a version it is the latest.
 */
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";
import { projectDbForRoute } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import {
  questionnaireFileClient,
  type QuestionnaireFileInput,
} from "@/server/services/QuestionnaireFileClient";
import { formExportClient } from "@/server/services/FormExportClient";

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** The version as the questionnaire file's input (T50): every item with its wording. */
function fileInput(v: ResolvedQuestionnaireVersion): QuestionnaireFileInput {
  return {
    name: v.questionnaireName,
    description: v.description,
    version: v.versionNumber,
    blocks: [...v.blocks],
    items: v.questions.map((q) => ({
      setId: q.setId,
      setName: q.setName,
      setVersion: q.setVersionNumber,
      scope: q.scope,
      localId: q.localId,
      text: q.text,
      citation: q.citation,
      required: q.required,
      annexPoint: q.annexPoint,
      groupLabel: q.groupLabel,
    })),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string; questionnaireId: string }> },
) {
  const { project, questionnaireId } = await params;
  const db = await projectDbForRoute(project, { write: false });
  if (db instanceof Response) return db;
  const query = new URL(request.url).searchParams;
  const format = query.get("format");
  if (format !== "json" && format !== "csv" && format !== "md") return text(400, "format must be json, csv or md");

  const bundle = query.get("bundle");
  if (bundle !== null && (format !== "json" || bundle !== "self-contained")) {
    return text(400, "bundle applies to json only, and is self-contained");
  }

  const version = query.get("version");
  if (version !== null && !/^[1-9]\d*$/.test(version)) return text(404, "Not found");

  const v = await questionnairesOn(db).exportable(questionnaireId, version === null ? undefined : Number(version));
  if (!v) return text(404, "Not found");

  const written =
    format === "json"
      ? await questionnaireFileClient.write(fileInput(v), bundle === "self-contained" ? "self-contained" : "references")
      : await formExportClient.write(
          {
            name: v.questionnaireName,
            version: v.versionNumber,
            questions: v.questions.map((q) => ({
              text: q.text,
              citation: q.citation,
              required: q.required,
              annexPoint: q.annexPoint,
            })),
          },
          format,
        );
  if (!written.ok) return text(written.status, written.error);

  return new Response(new TextEncoder().encode(written.content), {
    headers: {
      "Content-Type": written.contentType,
      "Content-Disposition": `attachment; filename="${written.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
