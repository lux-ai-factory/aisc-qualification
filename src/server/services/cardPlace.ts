import type { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { platformClient, type PlatformClient } from "@/server/services/PlatformClient";

/**
 * Which card version and revision a card is, and whether a later revision of the same version replaced it:
 * what a download of the card says about itself, so two revisions of one version are never mistaken for
 * each other. The version number is null when the platform could not say: a download never fails for it.
 */
export type CardPlace = {
  version: number | null;
  revision: number;
  superseded: boolean;
  amendReason: string | null;
  amendRequestedBy: string | null;
};

export async function cardPlace(
  project: string,
  repo: Pick<QualificationRepository, "cardRefs">,
  card: { id: string; systemId: string; revision?: number; amendReason?: string | null; amendRequestedBy?: string | null },
  platform: Pick<PlatformClient, "listVersions"> = platformClient,
): Promise<CardPlace> {
  const revision = card.revision ?? 1;
  const versions = await platform.listVersions(project).catch(() => []);
  const refs = await repo.cardRefs();
  const latestRevision = Math.max(revision, ...refs.filter((r) => r.systemId === card.systemId).map((r) => r.revision));
  return {
    version: versions.find((v) => v.pid === card.systemId)?.number ?? null,
    revision,
    superseded: latestRevision > revision,
    amendReason: card.amendReason ?? null,
    amendRequestedBy: card.amendRequestedBy ?? null,
  };
}
