import {
  QualificationRepository,
  qualificationRepository,
  type QualificationWithAnswers,
} from "@/server/repositories/QualificationRepository";
import {
  QualificationFormParser,
  qualificationFormParser,
} from "@/server/forms/QualificationFormParser";
import { PlatformClient, platformClient } from "@/server/services/PlatformClient";

export class QualificationService {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
  ) {}

  /**
   * Qualify a system inside a project.
   *
   * The system is named on the platform first: the engine's tests and the
   * dashboard's results point at that same row, so a qualification that
   * described a system nobody else could name would be a dead end. Registering
   * is idempotent, so re-qualifying the same system finds the one already
   * there instead of making a second.
   */
  async createFromForm(project: string, formData: FormData): Promise<{ id: string }> {
    const parsed = this.parser.parse(formData);
    const system = await this.platform.registerSystem(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description,
    });
    return this.repo.create({
      ...parsed,
      projectId: system.project_id,
      systemId: system.pid,
    });
  }

  list(projectId: string): Promise<QualificationWithAnswers[]> {
    return this.repo.list(projectId);
  }

  /** One qualification of one project. The project is part of the query: see
   *  QualificationRepository.find. */
  get(projectId: string, id: string): Promise<QualificationWithAnswers | null> {
    return this.repo.find(projectId, id);
  }
}

export const qualificationService = new QualificationService();
