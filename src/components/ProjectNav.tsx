import Link from "next/link";
import NavMenu from "@/components/NavMenu";

/**
 * A project's links: its latest AI card, its versions, and the "Questionnaire setup" menu (question bank,
 * questionnaires, how the AI card is built: what a qualification is measured by, as opposed to the system
 * and its versions, which are what gets measured).
 *
 * The site header shows them top right; a saved card's left menu shows them at
 * its bottom instead, and the header hides its own (see .qf-sidemenu in
 * globals.css). "← Back" is not one of them: it is the header's own button and
 * stays there on every page.
 *
 * A card page and the edit form leave the latest AI card out (`withSystem={false}`): the
 * page already is the system, and the form has its own Cancel.
 */
export default function ProjectNav({
  project,
  className = "site-nav",
  withSystem = true,
}: {
  project: string;
  className?: string;
  withSystem?: boolean;
}) {
  return (
    <nav className={className}>
      {withSystem && <Link href={`/p/${project}/system`}>Latest AI card</Link>}
      <Link href={`/p/${project}/qualifications`}>AI card versions</Link>
      <NavMenu label="Questionnaire setup">
        <Link href={`/p/${project}/question-sets`}>Question bank</Link>
        <Link href={`/p/${project}/questionnaires`}>Questionnaires</Link>
        <Link href="/methodology">How the AI card is built</Link>
      </NavMenu>
    </nav>
  );
}
