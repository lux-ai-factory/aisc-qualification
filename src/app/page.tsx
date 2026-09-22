import { redirect } from "next/navigation";

/**
 * The app reached without a project.
 *
 * The project is chosen once, on the launcher, and every module then works
 * inside it. So this page does not ask again: it sends you to the one place
 * that answers the question, and the launcher's card opens this app on the
 * project you pick.
 */
export default function NoProjectPage() {
  redirect(process.env.LAUNCHER_URL || "http://localhost:8100/");
}
