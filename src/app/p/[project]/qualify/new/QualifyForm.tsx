"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { FormExample } from "@/data/examples";
import type { KeyQuestion } from "@/data/keyQuestions";
import {
  CAPABILITIES,
  DOMAINS,
  LOCALITIES,
  MODALITIES,
  OPERATORS,
  PURPOSES,
  SYSTEM_TYPES,
  isVairTerm,
  type VairClass,
  type VairTerm,
} from "@/data/vairVocab";
import { METADATA_FIELDS, type MetadataFieldId } from "@/data/formFields";
import ChipPicker from "./ChipPicker";
import RiskRows from "./RiskRows";
import ComponentRows from "./ComponentRows";
import { submitQualification, type SubmitState } from "./actions";
import SubmitOverlay from "./SubmitOverlay";
import DocumentUpload from "./DocumentUpload";
import { useDocumentPrefill, type PicksApplier } from "./useDocumentPrefill";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import type { FormBlock } from "@/domain/forms/blocks";
import { moveNotice, rewordedSince } from "@/domain/forms/moveCard";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

type Props = {
  /** The project whose AI system this describes. */
  project: string;
  /** The questionnaire version to fill: which blocks and questions it has.
   *  Absent is the default version. */
  form?: ResolvedQuestionnaireVersion;
  /** The version the previous card was filled with, when this card moves to
   *  another one: the move is announced, reworded questions flagged. */
  previous?: ResolvedQuestionnaireVersion | null;
  /** The previous card's version number, for "Reworded since v<N>". */
  cardNumber?: number;
  /** Unused: the questions come from `form`. Still accepted so existing
   *  callers type-check. */
  keyQuestions?: KeyQuestion[];
  /** A worked example to open the form on, for reading and correcting rather
   *  than typing from scratch. Every field stays editable. */
  initial?: FormExample;
};

/** Metadata label with its EU AI Act citation chip. */
function FieldLabel({ htmlFor, id }: { htmlFor: string; id: MetadataFieldId }) {
  const f = METADATA_FIELDS[id];
  return (
    <label className="qf-field-label" htmlFor={htmlFor}>
      {f.label} <span className="qf-citation">{f.citation}</span>
    </label>
  );
}

export default function QualifyForm({
  project,
  form,
  previous,
  cardNumber,
  initial,
}: Props) {
  const v = useMemo(() => form ?? annexDefaultVersion(), [form]);
  // A card moving to another questionnaire version: what the notice says, and
  // which carried answers sit under a question worded differently now.
  const carried = initial?.answers ?? {};
  const moving =
    previous && previous.versionId !== v.versionId
      ? moveNotice({ from: previous, to: v, cardNumber: cardNumber ?? 0, answers: carried })
      : null;
  const reworded = useMemo<Record<string, string>>(
    () => (previous && previous.versionId !== v.versionId ? rewordedSince(previous, v) : {}),
    [previous, v],
  );
  const has = (block: FormBlock) => v.blocks.includes(block);
  const meta = initial?.metadata;
  // The tag sets are VAIR terms, held here because they are chips, not fields.
  const [targetTags, setTargetTags] = useState<Set<string>>(
    new Set(meta?.targetSystemTags ?? []),
  );
  const [sectorTagSet, setSectorTagSet] = useState<Set<string>>(
    new Set(meta?.sectorTags ?? []),
  );
  const [marketForms, setMarketForms] = useState<Set<string>>(
    new Set(meta?.marketFormTags ?? []),
  );
  const [localities, setLocalities] = useState<Set<string>>(
    new Set(meta?.localityTags ?? []),
  );

  const toggleIn =
    (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
      set((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
  const toggleTarget = toggleIn(setTargetTags);
  const toggleSector = toggleIn(setSectorTagSet);
  const toggleMarketForm = toggleIn(setMarketForms);
  const toggleLocality = toggleIn(setLocalities);

  // The qualification is of this project's system: the action is bound to it
  // rather than reading it from the form, so it cannot be posted for another.
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitQualification.bind(null, project),
    undefined,
  );

  // A document's VAIR picks, by the rule the text fields follow: "only the empty ones"
  // fills a pick the author has not made, "replace" puts the document's in place of theirs. A tag set
  // the form does not have takes nothing.
  const applyPicks: PicksApplier = (picks, mode, formEl) => {
    let landed = 0;
    for (const [name, cls] of [
      ["systemType", "AISystem"],
      ["purpose", "Purpose"],
      ["providerTerm", "AIOperator"],
      ["deployerTerm", "AIOperator"],
    ] as const) {
      const value = picks[name];
      const el = formEl?.elements.namedItem(name);
      if (!value || !isVairTerm(cls, value) || !(el instanceof HTMLSelectElement)) continue;
      if (mode === "replace" || el.value === "") {
        el.value = value;
        landed += 1;
      }
    }
    const sets: Array<[FormBlock, VairClass, Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>]> = [
      ["targetSystemTags", "AICapability", targetTags, setTargetTags],
      ["sectorTags", "Domain", sectorTagSet, setSectorTagSet],
      ["marketFormTags", "Modality", marketForms, setMarketForms],
      ["localityTags", "LocalityOfUse", localities, setLocalities],
    ];
    for (const [block, cls, now, set] of sets) {
      const values = (picks[block as keyof typeof picks] as string[] | undefined)?.filter((t) => isVairTerm(cls, t));
      if (!has(block) || !values?.length) continue;
      if (mode === "replace" || now.size === 0) {
        set(new Set(values));
        landed += 1;
      }
    }
    return landed;
  };

  const { formRef, upload, riskRows, componentRows, pickDocument, chooseMode } = useDocumentPrefill(
    initial?.risks,
    v,
    initial?.components,
    applyPicks,
  );

  return (
    <>
      {/* outside the qualification's form, so a file is never posted with it;
          the class gives it the form's look */}
      {moving && <p className="qf-moving">{moving}</p>}
      <div className="qualify-form qualify-prefill">
        <DocumentUpload status={upload} onPick={pickDocument} onChoose={chooseMode} />
      </div>

      {/* Submitted through onSubmit, not action={formAction}: React resets a form whose
          action finishes, even when the save was refused, and these fields are uncontrolled
          (the document prefill writes onto them), so a refusal would erase everything filled in. */}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="qualify-form"
      >
        {state?.error && <div className="error">{state.error}</div>}

        <section className="qf-section">
          <h2>System metadata</h2>
          <p className="qf-help">
            Tell us what AI system this qualification is for. The tag on each
            field shows which part of the EU AI Act asks for it.
          </p>

          <div className="field">
            <FieldLabel htmlFor="systemName" id="systemName" />
            <input
              id="systemName"
              name="systemName"
              defaultValue={meta?.systemName ?? ""}
              placeholder="e.g. ShelfScan Vision"
              required
            />
          </div>
          <div className="qf-row">
            <div className="field">
              <FieldLabel htmlFor="systemVersion" id="systemVersion" />
              <input
                id="systemVersion"
                name="systemVersion"
                defaultValue={meta?.systemVersion ?? ""}
                placeholder="e.g. 2.4.0"
                required
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="company" id="company" />
              <input
                id="company"
                name="company"
                defaultValue={meta?.company ?? ""}
                placeholder="e.g. Acme Retail Technologies"
                required
              />
            </div>
          </div>
          <VairSelect
            name="providerTerm"
            id="providerTerm"
            terms={OPERATORS}
            initial={meta?.providerTerm ?? ""}
            label="Kind of provider"
          />
          {/* VAIR's AISystem and Purpose terms, on every form. Optional: VAIR's lists do not
              describe every system, and an open field is better than a false term. */}
          <div className="qf-row">
            <VairSelect
              name="systemType"
              id="systemType"
              terms={SYSTEM_TYPES}
              initial={meta?.systemType ?? ""}
            />
            <VairSelect
              name="purpose"
              id="purpose"
              terms={PURPOSES}
              initial={meta?.purpose ?? ""}
            />
          </div>
          {has("description") && (
            <div className="field">
              <FieldLabel htmlFor="description" id="description" />
              <textarea
                id="description"
                name="description"
                defaultValue={meta?.description ?? ""}
                rows={3}
                placeholder="One or two sentences explaining what the system does. e.g. 'Computer vision system that detects out-of-stock items on retail shelves from in-store camera footage.'"
                required
              />
            </div>
          )}
          {has("targetUseCase") && (
            <div className="field">
              <FieldLabel htmlFor="targetUseCase" id="targetUseCase" />
              <textarea
                id="targetUseCase"
                name="targetUseCase"
                defaultValue={meta?.targetUseCase ?? ""}
                rows={3}
                placeholder="The specific scenario the system is built for. e.g. 'Real-time alerts to store associates when high-velocity SKUs fall below the replenishment threshold.'"
                required
              />
            </div>
          )}
          {has("targetUsers") && (
            <div className="field">
              <FieldLabel htmlFor="targetUsers" id="targetUsers" />
              <textarea
                id="targetUsers"
                name="targetUsers"
                defaultValue={meta?.targetUsers ?? ""}
                rows={2}
                placeholder="Who interacts with the system and who is affected by its results. e.g. 'Store associates and shelf-replenishment staff in supermarkets across the EU.'"
                required
              />
            </div>
          )}
          {has("intendedDeployers") && (
            <div className="field">
              <FieldLabel htmlFor="intendedDeployers" id="intendedDeployers" />
              <textarea
                id="intendedDeployers"
                name="intendedDeployers"
                defaultValue={meta?.intendedDeployers ?? ""}
                rows={2}
                placeholder="Who will operate the system day to day. e.g. 'Supermarket chains running the cameras in their own stores.'"
                required
              />
            </div>
          )}
          {has("intendedDeployers") && (
            <VairSelect
              name="deployerTerm"
              id="deployerTerm"
              terms={OPERATORS}
              initial={meta?.deployerTerm ?? ""}
              label="Kind of deployer"
            />
          )}

          {has("targetSystemTags") && (
            <CapabilityPicker selected={targetTags} onToggle={toggleTarget} />
          )}

          {has("sectorTags") && (
            <ChipPicker
              name="sectorTags"
              label={METADATA_FIELDS.sectorTags.label}
              citation={METADATA_FIELDS.sectorTags.citation}
              help="These are the Annex III areas. Leave it empty when none applies."
              options={DOMAINS}
              selected={sectorTagSet}
              onToggle={toggleSector}
            />
          )}

          {has("marketFormTags") && (
            <ChipPicker
              name="marketFormTags"
              label={METADATA_FIELDS.marketFormTags.label}
              citation={METADATA_FIELDS.marketFormTags.citation}
              help="Pick every form that applies."
              options={MODALITIES}
              selected={marketForms}
              onToggle={toggleMarketForm}
            />
          )}

          {has("localityTags") && (
            <ChipPicker
              name="localityTags"
              label={METADATA_FIELDS.localityTags.label}
              citation={METADATA_FIELDS.localityTags.citation}
              help="The kind of setting it operates in. Leave it empty when none applies."
              options={LOCALITIES}
              selected={localities}
              onToggle={toggleLocality}
            />
          )}
        </section>

        {v.questions.length > 0 && (
          <section className="qf-section">
            <h2>Technical documentation</h2>
            <p className="qf-help">
              Answer in your own words: plain descriptions are more useful here than
              formal language. Everything is required except the questions marked{" "}
              <em>where applicable</em>, which you can leave blank when they do not
              apply to your system. The tag on each question shows which part of EU
              AI Act Annex IV it covers, for whoever reviews your answers later.
            </p>
            {v.questions.map((q, i) => {
              const heading = q.groupLabel ?? q.setName;
              const prev = v.questions[i - 1];
              const isGroupStart = i === 0 || (prev.groupLabel ?? prev.setName) !== heading;
              const oldWording = reworded[q.field];
              const flagged = oldWording !== undefined && (carried[q.field] ?? "").trim() !== "";
              return (
                <div key={q.field} className="field">
                  {isGroupStart && <h3 className="qf-group">{heading}</h3>}
                  <label className="qf-question" htmlFor={q.field}>
                    {q.citation !== "" && <span className="qf-citation">{q.citation}</span>}
                    {!q.required && (
                      <span className="qf-optional">where applicable</span>
                    )}
                    <span className="qf-question-text">{q.text}</span>
                  </label>
                  {flagged && (
                    <p className="qf-wording-changed">
                      {`Reworded since v${cardNumber ?? 0}. Previous wording: ${oldWording}`}
                    </p>
                  )}
                  <textarea
                    id={q.field}
                    name={q.field}
                    defaultValue={initial?.answers[q.field] ?? ""}
                    rows={q.text.length > 300 ? 5 : 3}
                    required={q.required}
                  />
                </div>
              );
            })}
          </section>
        )}

        {/* on every card, whatever its questionnaire: the parts of the system */}
        {/* The keys restart each block from an upload's rows. They are siblings, so each needs its own
            prefix: two children keyed "1" make React render one block's rows more than once. */}
        <ComponentRows key={`components-${componentRows.version}`} initial={componentRows.rows} />

        {has("risks") && <RiskRows key={`risks-${riskRows.version}`} initial={riskRows.rows} />}

        <input type="hidden" name="questionnaireVersionId" value={v.versionId} />

        <div className="qf-actions">
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Building your AI card..." : "Save qualification"}
          </button>
        </div>
        <SubmitOverlay open={pending} />
      </form>
    </>
  );
}

/** One optional VAIR select with its label and citation: "" is "not chosen". */
function VairSelect({
  name,
  id,
  terms,
  initial,
  label,
}: {
  name: "systemType" | "purpose" | "providerTerm" | "deployerTerm";
  id: string;
  terms: VairTerm[];
  initial: string;
  /** For a select that is not a metadata field of its own: its name and a help line. */
  label?: string;
}) {
  return (
    <div className="field">
      {label === undefined ? (
        <FieldLabel htmlFor={id} id={name as MetadataFieldId} />
      ) : (
        <>
          <label className="qf-field-label" htmlFor={id}>
            {label}
          </label>
          <p className="qf-help">Only public bodies have a term here. Leave it empty for a company.</p>
        </>
      )}
      <select id={id} name={name} defaultValue={initial}>
        <option value="">Not chosen</option>
        {terms.map((t) => (
          <option key={t.id} value={t.id} title={t.definition || undefined}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** VAIR's 35 capabilities: too many for chips, so a list to add from and the chosen ones below. */
function CapabilityPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const labelFor = (id: string) => CAPABILITIES.find((t) => t.id === id)?.label ?? id;

  return (
    <div className="field">
      <label className="qf-field-label" htmlFor="targetSystemPick">
        {METADATA_FIELDS.targetSystemTags.label}{" "}
        <span className="qf-citation">
          {METADATA_FIELDS.targetSystemTags.citation}
        </span>
      </label>
      <p className="qf-help">
        Add every capability that applies. {selected.size} selected.
      </p>
      <div className="qf-picker-row">
        <select
          id="targetSystemPick"
          name="targetSystemPick"
          className="qf-picker-select"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v && !selected.has(v)) onToggle(v);
          }}
        >
          <option value="">Add a capability…</option>
          {CAPABILITIES.filter((t) => !selected.has(t.id)).map((t) => (
            <option key={t.id} value={t.id} title={t.definition || undefined}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {selected.size > 0 && (
        <div className="qf-picker-selected">
          {Array.from(selected).map((id) => (
            <button
              type="button"
              key={id}
              className="qf-selected-chip"
              onClick={() => onToggle(id)}
              aria-label={`Remove ${labelFor(id)}`}
            >
              {labelFor(id)} <span className="qf-selected-x">×</span>
            </button>
          ))}
        </div>
      )}
      {Array.from(selected).map((t) => (
        <input key={t} type="hidden" name="targetSystemTags" value={t} />
      ))}
    </div>
  );
}
