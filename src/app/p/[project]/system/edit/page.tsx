import { findExample } from "@/data/examples";
import { qualificationService } from "@/server/services/QualificationService";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import { pickQuestionnaireParams, preselect } from "@/domain/forms/chooser";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";
import QualifyForm from "../../qualify/new/QualifyForm";
import FormChooser from "./FormChooser";
import FormLine from "../../FormLine";
import ProjectNav from "@/components/ProjectNav";
import { updateAnswersLabel } from "@/domain/SystemCard";

export default async function EditSystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    example?: string;
    questionnaire?: string;
    questionnaireVersion?: string;
    form?: string;
    formVersion?: string;
  }>;
}) {
  const { project } = await params;
  // `?example=mcas` opens the card form already filled, to be read and
  // corrected rather than typed. It writes nothing: the person still presses
  // the button. It is always the Annex IV default, so it skips the chooser.
  const { example, questionnaire, questionnaireVersion, form, formVersion } =
    await searchParams;
  const basePath = process.env.NEXT_BASE_PATH || "";
  // The questionnaires this card may be filled with are the project's own (and the builtin default).
  const questionnaires = questionnairesOn(await projectDbPastDoor(project));

  // `?questionnaireVersion=<id>` fills that very version, and wins over
  // `?questionnaire=<id>`, which fills that questionnaire's latest version. The
  // old names ?formVersion and ?form are aliases. An unknown one never
  // falls back to the other. None: the person picks a questionnaire first.
  const lookup = pickQuestionnaireParams({
    example,
    questionnaire,
    questionnaireVersion,
    form,
    formVersion,
  });
  const worked = lookup.lookup === "example" ? findExample(example) : undefined;
  let version: ResolvedQuestionnaireVersion | null = null;
  let error: string | null = null;
  if (lookup.lookup === "example") version = annexDefaultVersion();
  else if (lookup.lookup === "version")
    version = await questionnaires.resolve(lookup.id);
  else if (lookup.lookup === "latest")
    version = await questionnaires.latestVersion(lookup.id);
  if (!version && lookup.lookup !== "none")
    error = "That questionnaire was not found.";

  // Otherwise the card starts from the latest card, to be reviewed: every save
  // makes the next version, and the next version is mostly the last one again.
  // A lookup that fails is not "no card yet" (that is an answer with no
  // versions): an empty form saved now would start the card over and give
  // every component a new key, so the page says so and offers no form.
  let start: Awaited<
    ReturnType<typeof qualificationService.startingPoint>
  > | null = null;
  if (!worked) {
    try {
      start = await qualificationService.startingPoint(project);
    } catch (err) {
      console.warn(
        `edit page of project ${project}: the starting card could not be read: ${String(err)}`,
      );
      return (
        <main className="qualify-page">
          <header className="qualify-header">
            <h1>The AI card cannot be edited right now</h1>
            <p>
              The platform did not answer, so the card this edit starts from
              cannot be read. Try again in a moment.
            </p>
          </header>
        </main>
      );
    }
  }
  // P: the questionnaire version the latest card was filled with, resolved.
  const fromId = start?.fromQuestionnaireVersionId ?? null;
  const from = fromId ? await questionnaires.resolve(fromId) : null;

  if (!version) {
    const options = await questionnaires.chooserOptions();
    const preselected = preselect(options, { fromVersionId: fromId });
    const previous =
      start && fromId && from
        ? {
            cardVersionNumber: start.next.fromVersionNumber ?? 0,
            versionId: fromId,
            name: from.questionnaireName,
            versionNumber: from.versionNumber,
          }
        : null;
    return (
      <main className="qualify-page qualify-page--fill">
        <header className="qualify-header">
          <h1>
            {start?.initial
              ? updateAnswersLabel(start.next.fromVersionNumber ?? undefined)
              : "Create the AI card"}
          </h1>
          <p>
            Choose the questionnaire to fill: its questions are what the AI card
            asks.
          </p>
        </header>
        <FormChooser
          project={project}
          options={options.map((o) => ({
            questionnaireId: o.questionnaireId,
            name: o.name,
            versionNumber: o.version,
            questionCount: o.questionCount,
            isDefault: o.isDefault,
            versionId: o.versionId,
            versionIds: o.versionIds,
          }))}
          preselected={preselected}
          previous={previous}
          error={error}
        />
      </main>
    );
  }

  // Moving the card to another questionnaire version: QualifyForm says so and
  // flags reworded questions. The same version: nothing to say.
  const moving =
    start && from && from.versionId !== version.versionId ? from : null;
  const initial = worked ?? start?.initial ?? null;

  return (
    <main className="qualify-page qualify-page--fill qualify-page--menu">
      <QualifyForm
        project={project}
        form={version}
        previous={moving}
        cardNumber={
          moving ? (start?.next.fromVersionNumber ?? undefined) : undefined
        }
        initial={initial ?? undefined}
        nav={
          <ProjectNav
            project={project}
            withSystem={false}
            className="qf-sidemenu-nav"
          />
        }
        saveLabel={
          start ? `Save as v${start.next.versionNumber}` : "Save the AI card"
        }
        cancelHref={
          start?.next.fromCardId
            ? `/p/${project}/qualify/${start.next.fromCardId}`
            : `/p/${project}/qualifications`
        }
        header={
          <header className="qualify-header">
            <h1>
              {start?.initial
                ? updateAnswersLabel(start.next.fromVersionNumber ?? undefined)
                : "Create the AI card"}
            </h1>
            <p>
              {start
                ? `Saving makes v${start.next.versionNumber} of the AI card; ` +
                  "earlier versions stay as they were." +
                  (start.next.fromCardId
                    ? ` Corrections made on v${start.next.fromVersionNumber}'s AI card come along where their item is the same.`
                    : "")
                : "The project's one AI system: describe it and answer the questions, one part at a time from the menu on the left."}
            </p>
            <FormLine
              project={project}
              questionnaireId={version.questionnaireId}
              questionnaireName={version.questionnaireName}
              versionNumber={version.versionNumber}
              basePath={basePath}
            />
            {start?.initial && (
              <p className="qf-prefilled">
                Filled in from v{start.next.fromVersionNumber}. Change what is
                no longer true, then save: that makes v
                {start.next.versionNumber}.
              </p>
            )}
            {worked && (
              <p className="qf-prefilled">
                Filled in from the documentation for{" "}
                <strong>{worked.metadata.systemName}</strong>. Read it, correct
                anything the documents do not support, then save.
              </p>
            )}
          </header>
        }
      />
    </main>
  );
}
