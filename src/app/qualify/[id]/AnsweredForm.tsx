import type { ReactNode } from "react";

import {
  AFFECTED,
  IMPACT_AREAS,
  LOCALITIES,
  MARKET_FORMS,
  vocabLabel,
} from "@/data/airoVocab";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { METADATA_FIELDS, type MetadataFieldId } from "@/data/formFields";
import { RISK_BLOCK, RISK_FIELDS } from "@/data/riskFields";
import { findSector, parseTargetSystemTag } from "@/data";

// The qualification as it was answered: the same fields, in the same order,
// with the same AI Act citations as the form that collected them, but read-only.
//
// Everything is resolved here rather than by the page, so the one place that
// knows how a stored value turns back into what the user saw is this file.
export type AnsweredFormProps = {
  metadata: {
    systemName: string;
    systemVersion: string;
    company: string;
    description: string;
    targetUseCase: string;
    targetUsers: string;
    intendedDeployers: string | null;
    targetSystemTags: string[];
    sectorTags: string[];
    marketFormTags: string[];
    localityTags: string[];
  };
  answers: {
    id: string;
    toolId: string;
    questionId: string;
    answer: string;
  }[];
  risks: {
    id: string;
    risk: string;
    source: string;
    vulnerability: string | null;
    consequence: string;
    affected: string;
    impactAreas: string[];
    control: string;
    followUpControl: string | null;
  }[];
};

const BLANK = <span className="qf-blank">left blank</span>;

/** One label/value row: the shape every section of the form is built from. */
function Row({
  label,
  citation,
  note,
  children,
}: {
  label: string;
  citation: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="qf-read-field">
      <dt>
        {label}
        {note}
        <span className="qf-citation">{citation}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Field({
  id,
  children,
}: {
  id: MetadataFieldId;
  children: ReactNode;
}) {
  const field = METADATA_FIELDS[id];
  return (
    <Row label={field.label} citation={field.citation}>
      {children}
    </Row>
  );
}

/** A list of tags as their labels, or the blank marker. */
function tags(values: string[], label: (v: string) => string) {
  if (values.length === 0) return BLANK;
  return (
    <ul className="qf-tag-list">
      {values.map((v) => (
        <li key={v}>{label(v)}</li>
      ))}
    </ul>
  );
}

export default function AnsweredForm({
  metadata,
  answers,
  risks,
}: AnsweredFormProps) {
  const byId = new Map(
    answers.map((a) => [`${a.toolId}:${a.questionId}`, a] as const),
  );
  // Walk the question set, not the stored answers: an optional question left
  // blank has no row in the database, and the reader still needs to see that it
  // was asked and skipped rather than never asked at all.
  const groups = KEY_QUESTIONS.reduce<
    { group: string; label: string; questions: typeof KEY_QUESTIONS }[]
  >((acc, question) => {
    const last = acc[acc.length - 1];
    if (last && last.group === question.group) last.questions.push(question);
    else
      acc.push({
        group: question.group,
        label: question.groupLabel,
        questions: [question],
      });
    return acc;
  }, []);

  return (
    <div className="qf-read">
      {/* No heading over the metadata: the tab says "Answered form" and this is
          simply where it starts. The question groups below keep theirs. */}
      <section className="qf-section">
        <dl className="qf-read-list">
          <Field id="systemName">{metadata.systemName}</Field>
          <Field id="systemVersion">{metadata.systemVersion}</Field>
          <Field id="company">{metadata.company}</Field>
          <Field id="description">{metadata.description}</Field>
          <Field id="targetUseCase">{metadata.targetUseCase}</Field>
          <Field id="targetUsers">{metadata.targetUsers}</Field>
          <Field id="intendedDeployers">
            {metadata.intendedDeployers || BLANK}
          </Field>
          <Field id="targetSystemTags">
            {tags(metadata.targetSystemTags, (t) => {
              const parsed = parseTargetSystemTag(t);
              return parsed ? `${parsed.category.name}: ${parsed.sub.name}` : t;
            })}
          </Field>
          <Field id="sectorTags">
            {tags(metadata.sectorTags, (t) => findSector(t)?.name ?? t)}
          </Field>
          <Field id="marketFormTags">
            {tags(metadata.marketFormTags, (t) => vocabLabel(MARKET_FORMS, t))}
          </Field>
          <Field id="localityTags">
            {tags(metadata.localityTags, (t) => vocabLabel(LOCALITIES, t))}
          </Field>
        </dl>
      </section>

      {groups.map((group) => (
        <section className="qf-section" key={group.group}>
          <h2 className="qf-group">{group.label}</h2>
          <dl className="qf-read-list">
            {group.questions.map((question) => {
              const stored = byId.get(`${question.group}:${question.id}`);
              return (
                <Row
                  key={question.id}
                  label={question.text}
                  citation={question.citation}
                  note={
                    question.optional ? (
                      <span className="qf-optional"> optional</span>
                    ) : undefined
                  }
                >
                  {stored ? stored.answer : BLANK}
                </Row>
              );
            })}
          </dl>
        </section>
      ))}

      <section className="qf-section">
        <h2>
          {RISK_BLOCK.title} ({risks.length})
          <span className="qf-citation">{RISK_BLOCK.citation}</span>
        </h2>
        {risks.map((row, i) => (
          <div className="qf-risk-view" key={row.id}>
            <h3>Risk {i + 1}</h3>
            <dl className="qf-read-list">
              {RISK_FIELDS.map((field) => {
                const value = riskValue(row, field.id);
                // An optional field left blank is not shown at all: the risk
                // rows are read as a chain, and a row of "left blank" breaks it.
                if (value === null) return null;
                return (
                  <Row
                    key={field.id}
                    label={field.label}
                    citation={field.citation}
                  >
                    {value}
                  </Row>
                );
              })}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}

/** The stored value for one risk field, or null when it was left blank. */
function riskValue(
  row: AnsweredFormProps["risks"][number],
  id: (typeof RISK_FIELDS)[number]["id"],
): string | null {
  switch (id) {
    case "affected":
      return vocabLabel(AFFECTED, row.affected);
    case "area":
      return row.impactAreas.length === 0
        ? null
        : row.impactAreas.map((a) => vocabLabel(IMPACT_AREAS, a)).join(", ");
    case "vulnerability":
      return row.vulnerability || null;
    case "followUpControl":
      return row.followUpControl || null;
    default:
      return row[id];
  }
}
