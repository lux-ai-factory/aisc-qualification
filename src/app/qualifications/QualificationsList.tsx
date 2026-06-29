"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { resolveKeyQuestion } from "@/data/keyQuestions";
import { generateSystemCard } from "../qualify/[id]/actions";

type Answer = {
  id: string;
  toolId: string;
  questionId: string;
  answer: string;
};

type SystemCardJson = {
  overview?: string;
  findings?: Array<{
    title: string;
    summary: string;
    points?: string[];
  }>;
  open_issues?: string[];
  classification?: {
    target_systems?: Array<{ category: string; subcategory: string }>;
    sectors?: string[];
  };
} | null;

export type ListItem = {
  id: string;
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  targetSystemTags: string[];
  sectorTags: string[];
  createdAt: string;
  hasSystemCard: boolean;
  systemCardJson: SystemCardJson;
  systemCardAt: string | null;
  answers: Answer[];
};

type ModalKind = "details" | "card" | null;

// next.config inlines NEXT_PUBLIC_BASE_PATH at build time. Raw <a href> links
// are not rewritten by Next's basePath, so prefix them explicitly (otherwise
// the downloads 404 when the app is served under e.g. /qualification).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function QualificationsList({
  items: initialItems,
}: {
  items: ListItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState<{ kind: ModalKind; id: string | null }>({
    kind: null,
    id: null,
  });
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!open.kind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen({ kind: null, id: null });
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open.kind]);

  const generate = (id: string) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await generateSystemCard(id);
      setBusyId(null);
      if (res?.error) {
        setError(res.error);
        return;
      }
      // Refetch by reading from the server action's revalidated path: simplest
      // approach is to ask the page for fresh data via a hard refresh of just
      // this row. Since revalidatePath was called server-side, navigating to
      // the same URL reloads. For UX, force a soft refresh.
      window.location.reload();
    });
  };

  const active = items.find((i) => i.id === open.id) ?? null;

  if (items.length === 0) {
    return (
      <div className="qf-empty">
        <p>You haven&apos;t qualified any system yet.</p>
        <Link className="btn" href="/qualify/new">
          Start your first qualification
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      <div className="qf-list">
        {items.map((item) => (
          <article key={item.id} className="qf-list-row">
            <div className="qf-list-main">
              <h3>{item.systemName}</h3>
              <p className="qf-list-meta">
                {item.company} · v{item.systemVersion} · saved{" "}
                {item.createdAt.slice(0, 10)} · {item.answers.length} answers
              </p>
              <p className="qf-list-desc">{item.description}</p>
            </div>
            <div className="qf-list-actions-row">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setOpen({ kind: "details", id: item.id })}
              >
                View qualification
              </button>
              {item.hasSystemCard ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpen({ kind: "card", id: item.id })}
                  >
                    View system card
                  </button>
                  <a
                    className="btn ghost"
                    href={`${basePath}/api/qualifications/${item.id}/system-card.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download PDF
                  </a>
                  <a
                    className="btn ghost"
                    href={`${basePath}/api/qualifications/${item.id}/system-card.json`}
                    download
                  >
                    Download JSON
                  </a>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => generate(item.id)}
                  disabled={pending && busyId === item.id}
                >
                  {pending && busyId === item.id
                    ? "Generating..."
                    : "Generate system card"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {open.kind && active && (
        <div
          className="qf-modal-backdrop"
          onClick={() => setOpen({ kind: null, id: null })}
        >
          <div
            className="qf-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="qf-modal-head">
              <div>
                <h2>
                  {open.kind === "card"
                    ? `${active.systemName} — system card`
                    : active.systemName}
                </h2>
                <p>
                  {active.company} · v{active.systemVersion}
                  {open.kind === "card" && active.systemCardAt && (
                    <>
                      {" "}
                      · generated{" "}
                      {active.systemCardAt.slice(0, 16).replace("T", " ")} UTC
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="qf-modal-close"
                onClick={() => setOpen({ kind: null, id: null })}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="qf-modal-body">
              {open.kind === "card" ? (
                <CardView item={active} />
              ) : (
                <DetailsView
                  item={active}
                  onGenerate={() => generate(active.id)}
                  pending={pending && busyId === active.id}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CardView({ item }: { item: ListItem }) {
  const card = item.systemCardJson;
  if (!card) return <p className="qf-help">No system card yet.</p>;
  return (
    <>
      <div
        className="qf-card-actions qf-card-actions--row"
        style={{ marginBottom: 16 }}
      >
        <a
          className="btn"
          href={`${basePath}/api/qualifications/${item.id}/system-card.pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download PDF
        </a>
        <a
          className="btn ghost"
          href={`${basePath}/api/qualifications/${item.id}/system-card.json`}
          download
        >
          Download JSON
        </a>
      </div>
      {card.classification && (
        <section className="qf-modal-section">
          <h3>Classification</h3>
          <p className="qf-list-tags">
            {card.classification.target_systems?.map((t, i) => (
              <span key={i} className="qf-tag">
                {t.category} / {t.subcategory}
              </span>
            ))}
            {card.classification.sectors?.map((s, i) => (
              <span key={`s-${i}`} className="qf-tag qf-tag--sector">
                {s}
              </span>
            ))}
          </p>
        </section>
      )}
      {card.overview && (
        <section className="qf-modal-section">
          <h3>Overview</h3>
          <p>{card.overview}</p>
        </section>
      )}
      {card.findings?.map((f, fi) => (
        <section key={f.title || fi} className="qf-modal-section">
          <h3>{f.title}</h3>
          <p>{f.summary}</p>
          {f.points && f.points.length > 0 && (
            <ul>
              {f.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section className="qf-modal-section">
        <h3>Open issues / gaps</h3>
        {card.open_issues && card.open_issues.length > 0 ? (
          <ul>
            {card.open_issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        ) : (
          <p className="qf-help">No open issues recorded.</p>
        )}
      </section>
    </>
  );
}

function DetailsView({
  item,
  onGenerate,
  pending,
}: {
  item: ListItem;
  onGenerate: () => void;
  pending: boolean;
}) {
  return (
    <>
      <section className="qf-modal-section">
        <h3>Metadata</h3>
        <dl className="qf-dl">
          <dt>Description</dt>
          <dd>{item.description}</dd>
          <dt>Target use case</dt>
          <dd>{item.targetUseCase}</dd>
          <dt>Target users</dt>
          <dd>{item.targetUsers}</dd>
        </dl>
      </section>

      <section className="qf-modal-section">
        <div className="qf-modal-cta-row">
          <h3>System card</h3>
          {item.hasSystemCard ? (
            <span className="qf-list-meta">
              Generated {item.systemCardAt?.slice(0, 16).replace("T", " ")} UTC
            </span>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={onGenerate}
              disabled={pending}
            >
              {pending ? "Generating..." : "Generate system card"}
            </button>
          )}
        </div>
        {item.hasSystemCard && (
          <a
            className="btn"
            href={`${basePath}/api/qualifications/${item.id}/system-card.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: "auto", padding: "10px 16px" }}
          >
            Download PDF
          </a>
        )}
      </section>

      <section className="qf-modal-section">
        <h3>Answers ({item.answers.length})</h3>
        {item.answers.map((a) => {
          const meta = resolveKeyQuestion(a.toolId, a.questionId);
          return (
            <div key={a.id} className="qf-answer">
              <code>
                {a.toolId}:{a.questionId}
              </code>
              {meta && <p className="qf-list-meta">{meta.groupLabel}</p>}
              {meta && <p className="qf-answer-q">{meta.text}</p>}
              <p>{a.answer}</p>
            </div>
          );
        })}
      </section>
    </>
  );
}
