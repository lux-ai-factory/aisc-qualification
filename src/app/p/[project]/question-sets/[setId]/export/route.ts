/**
 * GET /p/<project>/question-sets/<setId>/export?format=csv|md[&version=<n>]
 *
 * A question-set version as a file to download. Every member of the
 * project may export (the route door lets a reader through); the set is read
 * from the project's own database, so another project's sets are not found.
 * Without a version it is the set's latest. Builtin and retired sets export.
 */
import { projectDbForRoute } from "@/lib/projectDb";
import { questionSetsOn } from "@/server/services/QuestionSetService";
import { formExportClient } from "@/server/services/FormExportClient";

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string; setId: string }> },
) {
  const { project, setId } = await params;
  const db = await projectDbForRoute(project, { write: false });
  if (db instanceof Response) return db;
  const query = new URL(request.url).searchParams;
  const format = query.get("format");
  if (format !== "csv" && format !== "md")
    return text(400, "format must be csv or md");

  const version = query.get("version");
  if (version !== null && !/^[1-9]\d*$/.test(version))
    return text(404, "Not found");

  const set = await questionSetsOn(db).atNumber(
    setId,
    version === null ? undefined : Number(version),
  );
  if (!set) return text(404, "Not found");

  const written = await formExportClient.write(
    {
      name: set.setName,
      version: set.versionNumber,
      questions: set.questions.map((q) => ({
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
