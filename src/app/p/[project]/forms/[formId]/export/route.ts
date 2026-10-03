/**
 * GET /p/<project>/forms/<formId>/export?...
 *
 * Redirect for old form export links: a 308 to the questionnaire export of the
 * same id, with the query passed on unchanged for that route to judge.
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
