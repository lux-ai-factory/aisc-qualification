import type { ReactNode } from "react";

import {
  AFFECTED,
  IMPACT_AREAS,
  LOCALITIES,
  MARKET_FORMS,
  vocabLabel,
} from "@/data/airoVocab";
import { METADATA_FIELDS, type MetadataFieldId } from "@/data/formFields";
import { RISK_BLOCK, RISK_FIELDS } from "@/data/riskFields";
import { COMPONENT_BLOCK, COMPONENT_KINDS } from "@/data/componentFields";
import { findSector, parseTargetSystemTag } from "@/data";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import type { FormBlock } from "@/domain/forms/blocks";
import type { ResolvedQuestionnaireVersion, ResolvedQuestion } from "@/domain/forms/types";

// The qualification as it was answered: the same fields, in the same order,
// with the same AI Act citations as the form that collected them, but read-only.
// The form is the card's own form version: its blocks and its questions, in the
// wording they had when the card was filled.
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
  /** The Components block's rows, in order (targets plan v2); absent or empty on older cards. */
  systemComponents?: {
    id: string;
    name: string;
    role: string | null;
    kind: string;
    provider: string;
    providerName: string | null;
  }[];
  /** The version the card was filled with. Absent is the default version. */
  form?: ResolvedQuestionnaireVersion;
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
        {citation !== "" && <span className="qf-citation">{citation}</span>}
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
  systemComponents = [],
  form = annexDefaultVersion(),
}: AnsweredFormProps) {
  const has = (block: FormBlock) => form.blocks.includes(block);
  const byId = new Map<string, AnsweredFormProps["answers"][number]>(
    answers.map((a) => [`${a.toolId}:${a.questionId}`, a] as const),
  );
  // Walk the question set, not the stored answers: an optional question left
  // blank has no row in the database, and the reader still needs to see that it
  // was asked and skipped rather than never asked at all. A new group starts
  // wherever the heading changes, as on the qualification form.
  const groups = form.questions.reduce<
    { label: string; questions: ResolvedQuestion[] }[]
  >((acc, question) => {
    const label = question.groupLabel ?? question.setName;
    const last = acc[acc.length - 1];
    if (last && last.label === label) last.questions.push(question);
    else acc.push({ label, questions: [question] });
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
          {has("description") && (
            <Field id="description">{metadata.description}</Field>
          )}
          {has("targetUseCase") && (
            <Field id="targetUseCase">{metadata.targetUseCase}</Field>
          )}
          {has("targetUsers") && (
            <Field id="targetUsers">{metadata.targetUsers}</Field>
          )}
          {has("intendedDeployers") && (
            <Field id="intendedDeployers">
              {metadata.intendedDeployers || BLANK}
            </Field>
          )}
          {has("targetSystemTags") && (
            <Field id="targetSystemTags">
              {tags(metadata.targetSystemTags, (t) => {
                const parsed = parseTargetSystemTag(t);
                return parsed ? `${parsed.category.name}: ${parsed.sub.name}` : t;
              })}
            </Field>
          )}
          {has("sectorTags") && (
            <Field id="sectorTags">
              {tags(metadata.sectorTags, (t) => findSector(t)?.name ?? t)}
            </Field>
          )}
          {has("marketFormTags") && (
            <Field id="marketFormTags">
              {tags(metadata.marketFormTags, (t) => vocabLabel(MARKET_FORMS, t))}
            </Field>
          )}
          {has("localityTags") && (
            <Field id="localityTags">
              {tags(metadata.localityTags, (t) => vocabLabel(LOCALITIES, t))}
            </Field>
          )}
        </dl>
      </section>

      {groups.map((group, i) => (
        <section className="qf-section" key={`${i}:${group.label}`}>
          <h2 className="qf-group">{group.label}</h2>
          <dl className="qf-read-list">
            {group.questions.map((question) => {
              const stored = byId.get(question.key);
              return (
                <Row
                  key={question.key}
                  label={question.text}
                  citation={question.citation}
                  note={
                    !question.required ? (
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

      {systemComponents.length > 0 && (
        <section className="qf-section">
          <h2>
            {COMPONENT_BLOCK.title} ({systemComponents.length})
            <span className="qf-citation">{COMPONENT_BLOCK.citation}</span>
          </h2>
          <dl className="qf-read-list">
            {systemComponents.map((c) => (
              <Row key={c.id} label={c.name} citation={COMPONENT_KINDS.find((k) => k.id === c.kind)?.label ?? c.kind}>
                {[c.role, c.provider === "third_party" ? `Provided by ${c.providerName}` : "In-house"]
                  .filter(Boolean)
                  .join(". ")}
              </Row>
            ))}
          </dl>
        </section>
      )}

      {has("risks") && (
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
      )}
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
