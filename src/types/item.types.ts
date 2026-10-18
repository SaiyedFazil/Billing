export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  /** Rupees as an exact decimal string, e.g. "60.50". Never a number. */
  price: string;
  imageUrl: string | null;
  /** false = temporarily sold out: shown greyed out, cannot be billed. */
  isAvailable: boolean;
  /** Whole units. Ignored unless trackStock — see lib/utils/stock.ts. */
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

/** A row in the management table — flat, with the category name resolved. */
export type AdminItemRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** Rupees as an exact decimal string, e.g. "60.50". */
  price: string;
  imageUrl: string | null;
  imageFileId: string | null;
  isAvailable: boolean;
  sortOrder: number;
};
