import type { SelectedSlotPayload, UserRackSlot } from '../lib/machines.types';

/** Legacy rack card — inventory2 uses ImageRackCard instead; stub keeps machines.parts buildable. */
export type RackCardProps = {
  rackNumber: number;
  slots: UserRackSlot[];
  onSlotClick: (slot: SelectedSlotPayload) => void;
  onSlotDrop: (rackId: number, inventoryId: number) => void | Promise<void>;
  onDismantleRack: (slots: UserRackSlot[], successMessageKey?: string) => Promise<void>;
  rackDismantleLoading: boolean;
  rackActionBusy: boolean;
};

export function RackCard(_props: RackCardProps) {
  return null;
}
