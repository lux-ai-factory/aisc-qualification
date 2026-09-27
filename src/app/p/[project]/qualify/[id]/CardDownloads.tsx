// The card as a file: PDF for a reader, JSON for another service, JSON-LD for
// an RDF tool.
//
// The JSON carries both the view (with the AI Act citations, which the graph
// does not hold) and the graph itself. In the card header rather than in one
// view, since the downloads belong to the card and not to how it is displayed.
export type Downloads = { pdf: string; json: string; jsonld: string };

export default function CardDownloads({ downloads }: { downloads: Downloads }) {
  return (
    <div className="onto-downloads">
      <a
        className="btn"
        href={downloads.pdf}
        target="_blank"
        rel="noopener noreferrer"
        title="This graph rendered for a reader"
      >
        Download PDF
      </a>
      <a
        className="btn ghost"
        href={downloads.json}
        download
        title="This card as JSON: the view with its AI Act citations, the risk chains, the Annex IV answers, and the graph itself"
      >
        Download JSON
      </a>
      <a
        className="btn ghost"
        href={downloads.jsonld}
        download
        title="The graph alone, as JSON-LD, for an RDF tool"
      >
        JSON-LD
      </a>
    </div>
  );
}
