# Pre-fill

Upload the document you already wrote, and the qualification form opens with
its answers in place. You amend them and save; nothing here is stored.

    POST /prefill
      file     the document: .pdf, .docx, .txt or .md
      mode     "empty" (fill only blank answers, the default) or "replace"
      current  what the form holds now, as JSON

      current_risks  the risk rows the form holds now, as a JSON list

    -> { values, filled, kept, proposed, read, source, model,
         risks, risksKept, risksProposed }

Two signals, both deterministic, so this works on an install with no model
configured:

* **the Annex.** The form's fourteen questions are the points of EU AI Act
  Annex IV, and technical documentation is usually written against the same
  Annex, so a heading of `Annex IV(1)(a)` or `1(a)` names the question.
* **labels.** `System name:`, `Provider:`, `Intended purpose:` and the usual
  variants, whether the value is on the line or under it.

* **risks.** Under a `Risks` heading (or `Risk register`, `Annex IV(5)`), one
  block per risk, started by `Risk 1` or by the next `Risk:` line:

      ### Risk 1
      Risk: An applicant is wrongly ranked as high risk
      Source: Bureau coverage is stale
      Vulnerability: Features assume complete history      (optional)
      Consequence: A creditworthy applicant is refused
      Affected: Users                     -> user / operator
      Impact areas: Fundamental rights    -> health, safety, right, freedom
      Control: A loan officer reviews every Reject
      Follow-up control: The officer may override          (optional)

  The form's own questions work as labels too ("What could go wrong:"). An
  "Affected" that names neither users nor the operator is left for the person
  to choose. The rows are one list: "empty" fills them only when no row has
  anything in it, "replace" swaps them for the document's.

A field the document says nothing about always keeps what it had, under both
modes: an upload must never empty a form.

    pip install -r requirements.txt && python -m pytest
