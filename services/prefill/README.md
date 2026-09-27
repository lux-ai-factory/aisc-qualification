# Pre-fill

Upload the document you already wrote, and the qualification form opens with
its answers in place. You amend them and save; nothing here is stored.

    POST /prefill
      file     the document: .pdf, .docx, .txt or .md
      mode     "empty" (fill only blank answers, the default) or "replace"
      current  what the form holds now, as JSON

      current_risks  the risk rows the form holds now, as a JSON list

      fields     (optional) the field names the form has, as a JSON list:
                 the identity, its blocks ("risks" when it has the risk block)
                 and its question fields. Nothing else is proposed.
      questions  (optional) the form's questions, as a JSON list of
                 {field, text, citation, annexPoint}

    -> { values, filled, kept, proposed, read, source, model,
         risks, risksKept, risksProposed }

Without `fields` and `questions` the form is the default Annex IV form and the
reading is exactly as below. With them, a form's own question is found by its
wording: a line that is its text, its citation, or both (also as `Label: value`),
with the answer running to the next line that names something. A question
tagged with an Annex IV point is also answered by that point's heading. When
`fields` has no `"risks"`, the risks are not read (`risks` is null).

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

    POST /forms/import
      file     a form file: .csv, .md (or .markdown) or .docx

    -> 200 { format, found, questions: [{text, citation, required, annexPoint}], warnings }
    -> 413 larger than PREFILL_MAX_BYTES
    -> 422 { detail } empty, another format, unreadable, or more than 200 questions

Reads a form's questions out of a file, for the person to review before they
save a form. Text rules only (prefill/form_import.py), no model, nothing
stored. A CSV has one question per row (a header row is recognised by a first
cell of `question`, `questions`, `text` or `question text`, and its
citation/required columns are found by name); Markdown and Word have one per
line or paragraph, with a trailing `[...]` as the citation and headings
skipped. Tables read like a CSV. Warnings say what was skipped, cut or merged.

`annexPoint` comes from a table's Annex column (a header of `annex_point`,
`annex point`, `annex iv point` or `annex`): one of the 14 point ids (`1a`,
`1b`, `1c`, `1de`, `1f`, `1gh`, `2a` to `2h`, any case), else `null` with a
warning naming the line. A file without that column gives `null` everywhere.
In a CSV, a cell the exporter guarded against spreadsheet formulas (a leading
`'` before `=`, `+`, `-` or `@`) loses that one `'`; in a Markdown table, `\|`
is a `|` inside a cell and `\\` a `\`. So a file the exporter wrote reads back
into the same questions.

    POST /forms/export
      JSON { format: "csv" | "md",
             form: { name, version (1 or more),
                     questions: [{text, citation, required, annexPoint}] } }

    -> 200 { filename, contentType, content }
    -> 422 { detail } "format must be csv or md"
                      "a form has at most 200 questions"
                      "question <n> names an Annex IV point that does not exist"

Writes one form version as a file, the counterpart of `/forms/import`
(prefill/form_export.py, standard library only, no model, nothing read or
stored). `annexPoint` is required in every question (`null` when there is
none); a missing key or a wrong type is pydantic's own 422. The CSV has the
header `question,citation,required,annex_point`, starts with a UTF-8 BOM, and
guards a text or citation cell that starts with `=`, `+`, `-` or `@` with a
leading `'`. The Markdown is a `# <name> (v<version>)` title, a one-line
comment, and a four-column table with `|` and `\` escaped. The filename is
`<slug of the name>-v<version>.csv` (or `.md`).

    POST /questionnaires/export
      JSON { bundle: "references" | "self-contained",
             questionnaire: { name, description, version (1 or more), blocks: [<block id>],
                              items: [{setId, setName, setVersion, scope, localId,
                                       text, citation, required, annexPoint, groupLabel}] } }

    -> 200 { filename, contentType, content }
    -> 422 { detail } "bundle must be references or self-contained"
                      "a questionnaire has at most 200 questions"
                      "item <n> has no wording: a self-contained file needs text, citation,
                       required, annexPoint and groupLabel"

Writes one questionnaire version as a JSON file (prefill/questionnaire_file.py,
standard library only, no model, nothing read or stored). The content is
`json.dumps(doc, ensure_ascii=False, indent=2)` plus a newline, keys in the order
`format` ("aisc-questionnaire"), `formatVersion` (1), `bundle`, `name`,
`description`, `version`, `blocks`, `items`. A references file names, per item,
the question set version (`setId`, `setName`, `setVersion`) and the question
(`scope`, `localId`); a self-contained file also carries the wording. The
wording keys are optional in the request, so a references export needs none; a
missing wording key when bundling is the 422 above (a `null` annexPoint or
groupLabel counts as present). Any other missing key or wrong type is pydantic's
own 422. The filename is `<slug of the name>-v<version>.questionnaire.json`.

    POST /questionnaires/import
      multipart: file (a .json questionnaire file)

    -> 200 { bundle, name, description, version, blocks, items }
    -> 413 the file is over PREFILL_MAX_BYTES
    -> 422 { detail }, the first of, in this order:
           "<ext> is not a questionnaire file format: json", "the file is empty",
           "this file is not JSON", "a questionnaire file is a JSON object",
           "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1",
           "bundle must be references or self-contained", "the questionnaire has no name",
           "the questionnaire name is longer than 120 characters",
           "the description is longer than 500 characters",
           "version must be a positive whole number", "<x> is not a block", "<x> is listed twice",
           "a questionnaire has at most 200 questions", "item <n> has no setId",
           "item <n> has no setVersion", "item <n> has no valid scope and localId",
           "item <n> is in the file twice", and for a self-contained file
           "item <n>: text must be 1 to 2000 characters",
           "item <n>: citation must be at most 200 characters",
           "item <n>: required must be true or false",
           "item <n>: annexPoint must be one of the 14 Annex IV points or null",
           "item <n>: groupLabel must be text of at most 120 characters or null"

Reads a questionnaire file back, the counterpart of `/questionnaires/export`.
The name is whitespace-collapsed, the description defaults to "", `setName` to
"", and a references file's items lose any wording keys. A file written by the
export reads back into the same questionnaire (text collapsed).

A .docx is a zip. Before it is opened (by `/prefill` and `/forms/import`
alike), the sizes of its parts are added up; more than
`PREFILL_MAX_UNZIPPED_BYTES` (default 52428800, 50 MiB; a missing,
non-integer or non-positive value means the default) is a 422 that says so,
and a file that is not a zip is a 422 "this .docx could not be read".

    pip install -r requirements.txt && python -m pytest
