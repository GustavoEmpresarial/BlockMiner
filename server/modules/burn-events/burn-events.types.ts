export type BurnEventOpenCheck = {
  isActive: boolean;
  deletedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  stockTotal: number | null;
  stockClaimed: number;
};
