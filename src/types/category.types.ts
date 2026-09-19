export type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Active items in this category. Shown so the owner knows what a delete affects. */
  itemCount: number;
};
