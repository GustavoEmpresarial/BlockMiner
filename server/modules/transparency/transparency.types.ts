import type { Prisma } from "@prisma/client";

export type ExternalInvestmentDbRow = Prisma.TransparencyExternalInvestmentGetPayload<{}>;

export interface CreateExternalInvestmentInput {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  amountInvestedUsd?: number;
  amountWithdrawnUsd?: number;
  roiForecast?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateExternalInvestmentInput = Partial<CreateExternalInvestmentInput>;

export interface ExternalInvestmentApiResponse {
  ok: boolean;
  investment?: ExternalInvestmentDbRow;
  investments?: ExternalInvestmentDbRow[];
  message?: string;
}
