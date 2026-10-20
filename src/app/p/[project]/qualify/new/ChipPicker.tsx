"use client";

/** A choice the picker offers: an id, its label, and VAIR's definition when it has one. */
export type ChipOption = { id: string; label: string; definition?: string };

/** Flat multi-select chips backed by one hidden input per selected id. */
export default function ChipPicker({
  name,
  label,
  citation,
  help,
  options,
  selected,
  onToggle,
}: {
  name: string;
  label: string;
  citation: string;
  help: string;
  options: ChipOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="field" data-field={name}>
      <label className="qf-field-label">
        {label} <span className="qf-citation">{citation}</span>
      </label>
      <p className="qf-help">
        {help} {selected.size} selected.
      </p>
      <div className="qf-picker-options">
        {options.map((o) => {
          const active = selected.has(o.id);
          return (
            <button
              type="button"
              key={o.id}
              className={`qf-chip${active ? " active" : ""}`}
              onClick={() => onToggle(o.id)}
              aria-pressed={active}
              title={o.definition || undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
