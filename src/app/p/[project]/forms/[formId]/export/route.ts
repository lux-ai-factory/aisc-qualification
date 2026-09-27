/**
 * GET /p/<project>/forms/<formId>/export?...
 *
 * The old form export: a 308 to the questionnaire export of the same id (D1,
 * T62), with the query passed on as it came; the new route judges it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string; formId: string }> },
) {
  const { project, formId } = await params;
  const basePath = process.env.NEXT_BASE_PATH || "";
  const search = new URL(request.url).search;
  return new Response(null, {
    status: 308,
    headers: { Location: `${basePath}/p/${encodeURIComponent(project)}/questionnaires/${encodeURIComponent(formId)}/export${search}` },
  });
}
