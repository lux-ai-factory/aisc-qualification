"use client";

import { useActionState, useState } from "react";
import type { Sector, TargetSystemCategory } from "@/data";
import type { FormExample } from "@/data/examples";
import { keyQuestionField, type KeyQuestion } from "@/data/keyQuestions";
import { LOCALITIES, MARKET_FORMS } from "@/data/airoVocab";
import { METADATA_FIELDS, type MetadataFieldId } from "@/data/formFields";
import ChipPicker from "./ChipPicker";
import RiskRows from "./RiskRows";
import { submitQualification, type SubmitState } from "./actions";
import SubmitOverlay from "./SubmitOverlay";

type Props = {
  keyQuestions: KeyQuestion[];
  targetSystems: TargetSystemCategory[];
  sectors: Sector[];
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
  keyQuestions,
  targetSystems,
  sectors,
  initial,
}: Props) {
  const meta = initial?.metadata;
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

  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitQualification,
    undefined,
  );

  return (
    <form action={formAction} className="qualify-form">
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

        <TargetSystemPicker
          targetSystems={targetSystems}
          selected={targetTags}
          onToggle={toggleTarget}
        />

        <SectorPicker
          sectors={sectors}
          selected={sectorTagSet}
          onToggle={toggleSector}
        />

        <ChipPicker
          name="marketFormTags"
          label={METADATA_FIELDS.marketFormTags.label}
          citation={METADATA_FIELDS.marketFormTags.citation}
          help="Pick every form that applies."
          options={MARKET_FORMS}
          selected={marketForms}
          onToggle={toggleMarketForm}
        />

        <ChipPicker
          name="localityTags"
          label={METADATA_FIELDS.localityTags.label}
          citation={METADATA_FIELDS.localityTags.citation}
          help="The kind of setting it operates in."
          options={LOCALITIES}
          selected={localities}
          onToggle={toggleLocality}
        />
      </section>

      <section className="qf-section">
        <h2>Technical documentation</h2>
        <p className="qf-help">
          Answer in your own words: plain descriptions are more useful here than
          formal language. Everything is required except the questions marked{" "}
          <em>where applicable</em>, which you can leave blank when they do not
          apply to your system. The tag on each question shows which part of EU
          AI Act Annex IV it covers, for whoever reviews your answers later.
        </p>
        {keyQuestions.map((kq, i) => {
          const fieldId = keyQuestionField(kq);
          const isGroupStart =
            i === 0 || keyQuestions[i - 1].group !== kq.group;
          return (
            <div key={fieldId} className="field">
              {isGroupStart && <h3 className="qf-group">{kq.groupLabel}</h3>}
              <label className="qf-question" htmlFor={fieldId}>
                <span className="qf-citation">{kq.citation}</span>
                {kq.optional && (
                  <span className="qf-optional">where applicable</span>
                )}
                <span className="qf-question-text">{kq.text}</span>
              </label>
              <textarea
                id={fieldId}
                name={fieldId}
                defaultValue={initial?.answers[fieldId] ?? ""}
                rows={kq.text.length > 300 ? 5 : 3}
                required={!kq.optional}
              />
            </div>
          );
        })}
      </section>

      <RiskRows initial={initial?.risks} />

      <div className="qf-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Building your AI card..." : "Save qualification"}
        </button>
      </div>
      <SubmitOverlay open={pending} />
    </form>
  );
}

function TargetSystemPicker({
  targetSystems,
  selected,
  onToggle,
}: {
  targetSystems: TargetSystemCategory[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState("");
  const cat = targetSystems.find((c) => c.id === activeCategory);

  // Build a quick lookup so we can show selected chips with their full label,
  // even after the user moves to a different category.
  const labelFor = (tag: string): string => {
    const [catId, subId] = tag.split(":");
    const category = targetSystems.find((c) => c.id === catId);
    if (!category) return tag;
    const sub = category.items.find((s) => s.id === subId);
    if (!sub) return category.name;
    return `${category.name} / ${sub.name}`;
  };

  return (
    <div className="field">
      <label className="qf-field-label" htmlFor="targetSystemCategory">
        {METADATA_FIELDS.targetSystemTags.label}{" "}
        <span className="qf-citation">
          {METADATA_FIELDS.targetSystemTags.citation}
        </span>
      </label>
      <p className="qf-help">
        Choose a category, then click the capabilities that apply.{" "}
        {selected.size} selected.
      </p>
      <div className="qf-picker-row">
        <select
          id="targetSystemCategory"
          className="qf-picker-select"
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
        >
          <option value="">Choose a category…</option>
          {targetSystems.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="qf-picker-options">
          {cat ? (
            cat.items.map((sub) => {
              const tag = `${cat.id}:${sub.id}`;
              const active = selected.has(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  className={`qf-chip${active ? " active" : ""}`}
                  onClick={() => onToggle(tag)}
                  aria-pressed={active}
                >
                  {sub.name}
                </button>
              );
            })
          ) : (
            <span className="qf-picker-placeholder">
              Pick a category to see its capabilities.
            </span>
          )}
        </div>
      </div>
      {selected.size > 0 && (
        <div className="qf-picker-selected">
          {Array.from(selected).map((tag) => (
            <button
              type="button"
              key={tag}
              className="qf-selected-chip"
              onClick={() => onToggle(tag)}
              aria-label={`Remove ${labelFor(tag)}`}
            >
              {labelFor(tag)} <span className="qf-selected-x">×</span>
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

function SectorPicker({
  sectors,
  selected,
  onToggle,
}: {
  sectors: Sector[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  const [pending, setPending] = useState("");
  const labelFor = (id: string) => sectors.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="field">
      <label className="qf-field-label" htmlFor="sectorPicker">
        {METADATA_FIELDS.sectorTags.label}{" "}
        <span className="qf-citation">
          {METADATA_FIELDS.sectorTags.citation}
        </span>
      </label>
      <p className="qf-help">
        Add a sector from the list. {selected.size} selected.
      </p>
      <div className="qf-picker-row">
        <select
          id="sectorPicker"
          className="qf-picker-select"
          value={pending}
          onChange={(e) => {
            const v = e.target.value;
            if (v && !selected.has(v)) onToggle(v);
            setPending("");
          }}
        >
          <option value="">Add a sector…</option>
          {sectors
            .filter((s) => !selected.has(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <span className="qf-picker-placeholder">
          Selecting a sector adds it to the chips below.
        </span>
      </div>
      {selected.size > 0 && (
        <div className="qf-picker-selected">
          {Array.from(selected).map((id) => (
            <button
              type="button"
              key={id}
              className="qf-selected-chip qf-selected-chip--sector"
              onClick={() => onToggle(id)}
              aria-label={`Remove ${labelFor(id)}`}
            >
              {labelFor(id)} <span className="qf-selected-x">×</span>
            </button>
          ))}
        </div>
      )}
      {Array.from(selected).map((t) => (
        <input key={t} type="hidden" name="sectorTags" value={t} />
      ))}
    </div>
  );
}
