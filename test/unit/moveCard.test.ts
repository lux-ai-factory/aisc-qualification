import { describe, it, expect } from "vitest";
import {
  formVersion,
  loadSrc,
  seededQuestion,
  setQuestion,
} from "../support/forms";

// Moving a card to another questionnaire version, and the "newer version" line on the card
// page. Pure functions of src/domain/forms/moveCard.ts.
//
// newerVersion(card, latest): the latest version of the
// card's questionnaire when it is listed, not retired and numbered higher; else null.

const mod = () => loadSrc("domain/forms/moveCard.ts");

const q1v1 = setQuestion("acme", "q1", {
  text: "Who signs off?",
  setVersionId: "acme-v1",
});
const q1v2 = setQuestion("acme", "q1", {
  text: "Who signs off a release?",
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const q2 = setQuestion("acme", "q2", { text: "Which data?" });
const q2recited = setQuestion("acme", "q2", {
  text: "Which data?",
  citation: "§9",
  required: false,
  annexPoint: "2d" as never,
});
const q3 = setQuestion("acme", "q3", { text: "Only in v1?" });
const q4 = setQuestion("acme", "q4", { text: "New in v2?" });
const q5 = setQuestion("acme", "q5", { text: "Also reworded?" });
const q5v2 = setQuestion("acme", "q5", { text: "Also reworded, differently?" });

const from = formVersion({
  questionnaireId: "acme",
  questionnaireName: "Acme AI policy",
  versionId: "acme-v1",
  versionNumber: 1,
  questions: [q1v1, q2, q3, q5, seededQuestion("2a")],
});
const to = formVersion({
  questionnaireId: "acme",
  questionnaireName: "Acme AI policy",
  versionId: "acme-v2",
  versionNumber: 2,
  questions: [q1v2, q2recited, q4, q5v2, seededQuestion("2a")],
});

describe("rewordedSince (T41)", () => {
  it("T41 D12 maps the field of every question of `to` also in `from` whose text differs to from's text", async () => {
    const { rewordedSince } = await mod();
    expect(rewordedSince(from, to)).toEqual({
      "q:s-acme:q1": "Who signs off?",
      "q:s-acme:q5": "Also reworded?",
    });
  });

  it("T41 D12 text only: a changed citation, required flag or Annex point is not a rewording", async () => {
    const { rewordedSince } = await mod();
    expect(rewordedSince(from, to)["q:s-acme:q2"]).toBeUndefined();
  });

  it("T41 the comparison is the exact string: a trailing space is a rewording", async () => {
    const { rewordedSince } = await mod();
    const spaced = formVersion({
      versionId: "acme-v3",
      questions: [{ ...q2, text: "Which data? " }],
    });
    expect(rewordedSince(from, spaced)).toEqual({
      "q:s-acme:q2": "Which data?",
    });
  });

  it("T41 questions only in one of the two, and the same version, give nothing", async () => {
    const { rewordedSince } = await mod();
    expect(
      rewordedSince(from, formVersion({ versionId: "x", questions: [q4] })),
    ).toEqual({});
    expect(rewordedSince(from, from)).toEqual({});
  });

  it("T41 it is pure", async () => {
    const { rewordedSince } = await mod();
    const before = JSON.stringify([from, to]);
    rewordedSince(from, to);
    expect(JSON.stringify([from, to])).toBe(before);
  });
});

describe("droppedAnswers (T41)", () => {
  it("T41 counts the non-blank answers whose field is not a question field of `to`", async () => {
    const { droppedAnswers } = await mod();
    expect(
      droppedAnswers(
        {
          "q:s-acme:q1": "The CTO.",
          "q:s-acme:q3": "Yes.", // not in `to`
          "q:f-old:q1": "Legacy.", // not in `to`
          "q:annex-2:2a": "Built on a model.",
        },
        to,
      ),
    ).toBe(2);
  });

  it("T41 blank or whitespace answers are not counted", async () => {
    const { droppedAnswers } = await mod();
    expect(droppedAnswers({ "q:s-acme:q3": "   ", "q:f-old:q1": "" }, to)).toBe(
      0,
    );
    expect(droppedAnswers({}, to)).toBe(0);
  });
});

describe("moveNotice (T41)", () => {
  const head =
    "Moving from Acme AI policy v1 to Acme AI policy v2. Answers are carried over by question.";

  it("T41 null when from and to are the same version", async () => {
    const { moveNotice } = await mod();
    expect(
      moveNotice({
        from,
        to: from,
        cardNumber: 3,
        answers: { "q:s-acme:q3": "Yes." },
      }),
    ).toBeNull();
  });

  it("T41 only the head when nothing is dropped and nothing answered is reworded", async () => {
    const { moveNotice } = await mod();
    expect(
      moveNotice({
        from,
        to,
        cardNumber: 3,
        answers: { "q:s-acme:q2": "Loans." },
      }),
    ).toBe(head);
  });

  it("T41 one dropped answer and one reworded answered question: the singular sentences", async () => {
    const { moveNotice } = await mod();
    expect(
      moveNotice({
        from,
        to,
        cardNumber: 3,
        answers: {
          "q:s-acme:q1": "The CTO.",
          "q:s-acme:q3": "Yes.",
          "q:s-acme:q5": "  ",
        },
      }),
    ).toBe(
      `${head} 1 answer to a question this version does not ask will not be carried over.` +
        " 1 reworded question is marked for review.",
    );
  });

  it("T41 several: the plural sentences", async () => {
    const { moveNotice } = await mod();
    expect(
      moveNotice({
        from,
        to,
        cardNumber: 3,
        answers: {
          "q:s-acme:q1": "The CTO.",
          "q:s-acme:q5": "Sometimes.",
          "q:s-acme:q3": "Yes.",
          "q:f-old:q1": "Legacy.",
        },
      }),
    ).toBe(
      `${head} 2 answers to questions this version does not ask will not be carried over.` +
        " 2 reworded questions are marked for review.",
    );
  });

  it("T41 a reworded question counts only when its carried answer is non-blank", async () => {
    const { moveNotice } = await mod();
    expect(
      moveNotice({
        from,
        to,
        cardNumber: 3,
        answers: { "q:s-acme:q1": "   ", "q:s-acme:q5": "" },
      }),
    ).toBe(head);
  });

  it("T41 the names and numbers come from each version (a move to another questionnaire)", async () => {
    const { moveNotice } = await mod();
    const other = formVersion({
      questionnaireId: "annex-iv-default",
      questionnaireName: "Annex IV default",
      versionId: "annex-iv-default-v1",
      versionNumber: 1,
      questions: [seededQuestion("2a")],
    });
    expect(
      moveNotice({
        from: to,
        to: other,
        cardNumber: 1,
        answers: { "q:annex-2:2a": "Built." },
      }),
    ).toBe(
      "Moving from Acme AI policy v2 to Annex IV default v1. Answers are carried over by question.",
    );
  });
});

describe("newerVersion (T42)", () => {
  const latest = (over: Record<string, unknown> = {}) =>
    formVersion({
      questionnaireId: "acme",
      versionId: "acme-v4",
      versionNumber: 4,
      ...over,
    });
  const card = formVersion({
    questionnaireId: "acme",
    versionId: "acme-v2",
    versionNumber: 2,
  });

  it("T42 D27 the latest version when the questionnaire is listed, not retired and numbered higher", async () => {
    const { newerVersion } = await mod();
    expect(newerVersion(card, latest())).toEqual({
      versionId: "acme-v4",
      versionNumber: 4,
    });
  });

  it("T42 null when the card is on the latest version", async () => {
    const { newerVersion } = await mod();
    expect(
      newerVersion(card, latest({ versionId: "acme-v2", versionNumber: 2 })),
    ).toBeNull();
  });

  it("T42 null for an unlisted (use once) or a retired questionnaire, or no latest", async () => {
    const { newerVersion } = await mod();
    expect(newerVersion(card, latest({ listed: false }))).toBeNull();
    expect(newerVersion(card, latest({ retired: true }))).toBeNull();
    expect(newerVersion(card, null)).toBeNull();
  });

  it("T42 null when the latest given is of another questionnaire", async () => {
    const { newerVersion } = await mod();
    expect(newerVersion(card, latest({ questionnaireId: "gov" }))).toBeNull();
  });

  it("T42 the builtin default has one version: never newer", async () => {
    const { newerVersion } = await mod();
    const d = formVersion({
      questionnaireId: "annex-iv-default",
      versionId: "annex-iv-default-v1",
      versionNumber: 1,
      builtin: true,
    });
    expect(newerVersion(d, d)).toBeNull();
  });
});
