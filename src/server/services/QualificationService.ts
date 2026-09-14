import {
  QualificationRepository,
  qualificationRepository,
  type QualificationWithAnswers,
} from "@/server/repositories/QualificationRepository";
import {
  QualificationFormParser,
  qualificationFormParser,
} from "@/server/forms/QualificationFormParser";

export class QualificationService {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly parser: QualificationFormParser = qualificationFormParser,
  ) {}

  createFromForm(formData: FormData): Promise<{ id: string }> {
    const parsed = this.parser.parse(formData);
    return this.repo.create(parsed);
  }

  list(): Promise<QualificationWithAnswers[]> {
    return this.repo.list();
  }

  get(id: string): Promise<QualificationWithAnswers | null> {
    return this.repo.find(id);
  }
}

export const qualificationService = new QualificationService();
