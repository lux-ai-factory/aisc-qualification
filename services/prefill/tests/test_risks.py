"""The risk rows: question 15, one full risk chain per row.

A document lists its risks under a Risks heading, one block per risk, each
field on a labelled line. The words for who and what is affected are matched
to the form's vocabulary; anything else is left for the person to choose.
"""
from prefill.fields import annex_sections
from prefill.risks import merge_risks, risks_from_text

TWO_RISKS = """\
Annex IV(2)(h)
Cybersecurity measures.

## Risks

### Risk 1
Risk: An applicant is wrongly ranked as high risk.
Source: Bureau coverage is stale.
Vulnerability: Features assume complete history.
Consequence: A creditworthy applicant is refused.
Affected: User
Impact areas: Fundamental rights
Control: A loan officer reviews every Reject.
Follow-up control: The officer may override.

### Risk 2
Risk: A model update degrades accuracy unnoticed.
Source: Drift after recalibration.
Consequence: More wrong decisions.
Affected: Operator
Impact areas: Fundamental rights, Safety
Control: A holdout gate before release.
"""


class TestReadingRisks:
    def test_one_row_per_block(self):
        rows = risks_from_text(TWO_RISKS)
        assert [r["risk"] for r in rows] == [
            "An applicant is wrongly ranked as high risk.",
            "A model update degrades accuracy unnoticed.",
        ]

    def test_every_field_of_a_row(self):
        first = risks_from_text(TWO_RISKS)[0]
        assert first == {
            "risk": "An applicant is wrongly ranked as high risk.",
            "source": "Bureau coverage is stale.",
            "vulnerability": "Features assume complete history.",
            "consequence": "A creditworthy applicant is refused.",
            "affected": "user",
            "areas": ["Right"],
            "control": "A loan officer reviews every Reject.",
            "followUpControl": "The officer may override.",
            # the VAIR selects: the document names no term, so each is left open
            "sourceTerm": "",
            "consequenceTerm": "",
            "impactTerm": "",
            "controlTerm": "",
            "followUpControlTerm": "",
        }

    def test_a_missing_optional_field_is_empty_not_absent(self):
        second = risks_from_text(TWO_RISKS)[1]
        assert second["vulnerability"] == ""
        assert second["followUpControl"] == ""

    def test_areas_are_matched_to_the_vocabulary(self):
        # VAIR's areas (2026-09-30); "Fundamental rights" is our old word for vair:Right
        assert risks_from_text(TWO_RISKS)[1]["areas"] == ["Right", "Safety"]

    def test_the_follow_up_is_not_read_as_the_control(self):
        first = risks_from_text(TWO_RISKS)[0]
        assert first["control"] == "A loan officer reviews every Reject."

    def test_who_is_affected_in_other_words(self):
        text = "Risks\nRisk: x\nAffected: the applicants using it\n"
        assert risks_from_text(text)[0]["affected"] == "user"
        text = "Risks\nRisk: x\nWho is affected: the bank operating the system\n"
        assert risks_from_text(text)[0]["affected"] == "operator"

    def test_an_unknown_affected_is_left_to_choose(self):
        """A guess here would be an answer nobody gave."""
        text = "Risks\nRisk: x\nAffected: society at large\n"
        assert risks_from_text(text)[0]["affected"] == ""

    def test_the_form_s_own_question_labels_work_too(self):
        text = (
            "Risks\n"
            "What could go wrong: A shelf is flagged empty when it is full.\n"
            "What causes it: Poor lighting.\n"
            "What happens as a result: Staff check a full shelf.\n"
            "What you do about it: Human confirmation.\n"
            "If that is not enough, what follows: Retrain on low light.\n"
        )
        row = risks_from_text(text)[0]
        assert row["risk"] == "A shelf is flagged empty when it is full."
        assert row["source"] == "Poor lighting."
        assert row["consequence"] == "Staff check a full shelf."
        assert row["control"] == "Human confirmation."
        assert row["followUpControl"] == "Retrain on low light."

    def test_a_new_risk_line_starts_a_new_row_without_a_heading(self):
        text = "Risks\nRisk: one\nControl: c1\n\nRisk: two\nControl: c2\n"
        assert [(r["risk"], r["control"]) for r in risks_from_text(text)] == [("one", "c1"), ("two", "c2")]

    def test_a_value_may_run_onto_the_lines_under_it(self):
        text = "Risks\nRisk: An applicant is\nwrongly ranked.\nSource: stale data\n"
        assert risks_from_text(text)[0]["risk"] == "An applicant is wrongly ranked."

    def test_no_risks_heading_means_no_risks(self):
        """Labels like Source: or Control: elsewhere in a document are prose."""
        assert risks_from_text("Annex IV(1)(a)\nRisk: this is prose\nControl: also prose\n") == []

    def test_a_block_that_says_nothing_is_not_a_row(self):
        assert risks_from_text("Risks\n\n### Risk 1\n\n### Risk 2\nRisk: real\n") == [
            {
                "risk": "real",
                "source": "",
                "vulnerability": "",
                "consequence": "",
                "affected": "",
                "areas": [],
                "control": "",
                "followUpControl": "",
                "sourceTerm": "",
                "consequenceTerm": "",
                "impactTerm": "",
                "controlTerm": "",
                "followUpControlTerm": "",
            }
        ]


def test_the_risks_heading_ends_the_annex_section_above_it():
    """Or the whole risk register would become the answer to 2(h)."""
    assert annex_sections(TWO_RISKS) == {"q:annex-2:2h": "Cybersecurity measures."}


class TestMergingRisks:
    """The rows are one list: they are filled or replaced together."""

    rows = [{"risk": "from the document"}]

    def test_an_empty_form_takes_the_document_s_rows(self):
        assert merge_risks([], self.rows, "empty") == (self.rows, False)

    def test_blank_rows_on_the_form_count_as_empty(self):
        blank = [{"risk": " ", "source": "", "areas": []}]
        assert merge_risks(blank, self.rows, "empty") == (self.rows, False)

    def test_fill_only_empty_keeps_rows_somebody_wrote(self):
        assert merge_risks([{"risk": "typed"}], self.rows, "empty") == (None, True)

    def test_replace_takes_the_document_s_rows(self):
        assert merge_risks([{"risk": "typed"}], self.rows, "replace") == (self.rows, False)

    def test_a_document_without_risks_never_empties_the_rows(self):
        assert merge_risks([{"risk": "typed"}], [], "replace") == (None, True)
        assert merge_risks([], [], "empty") == (None, False)
