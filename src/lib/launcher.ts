/** The launcher, where a project is chosen before any module opens inside it. */
export function launcherUrl(): string {
  return process.env.LAUNCHER_URL || "http://localhost:8100/";
}
