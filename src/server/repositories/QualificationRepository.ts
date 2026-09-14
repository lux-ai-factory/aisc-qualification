import type {
  PrismaClient,
  Prisma,
  Qualification,
  QualificationAnswer,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AnswerInput = {
  toolId: string;
  questionId: string;
  answer: string;
};

export type CreateQualificationInput = {
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  targetSystemTags: string[];
  sectorTags: string[];
  answers: AnswerInput[];
};

export type QualificationWithAnswers = Qualification & {
  answers: QualificationAnswer[];
};

export class QualificationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(input: CreateQualificationInput): Promise<{ id: string }> {
    const { answers, ...rest } = input;
    return this.db.qualification.create({
      data: {
        ...rest,
        answers: { create: answers },
      },
      select: { id: true },
    });
  }

  find(id: string): Promise<QualificationWithAnswers | null> {
    return this.db.qualification.findUnique({
      where: { id },
      include: { answers: true },
    });
  }

  list(): Promise<QualificationWithAnswers[]> {
    return this.db.qualification.findMany({
      orderBy: { createdAt: "desc" },
      include: { answers: true },
    });
  }

  cardSummary(id: string): Promise<
    | (Pick<Qualification, "systemName" | "systemVersion"> & {
        systemCardJson: Prisma.JsonValue | null;
      })
    | null
  > {
    return this.db.qualification.findUnique({
      where: { id },
      select: { systemCardJson: true, systemName: true, systemVersion: true },
    });
  }

  saveSystemCard(
    id: string,
    json: Prisma.InputJsonValue,
  ): Promise<Qualification> {
    return this.db.qualification.update({
      where: { id },
      data: { systemCardJson: json, systemCardAt: new Date() },
    });
  }
}

export const qualificationRepository = new QualificationRepository();
