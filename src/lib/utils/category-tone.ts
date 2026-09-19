/**
 * Tailwind classes for a category's tint. Items without a photo show their
 * initial on this tile, so a busy grid still scans by colour.
 *
 * Chosen by the category's position in its list, not by hashing its id: a
 * hash would let two of a handful of categories collide on the same colour.
 */
export type CategoryTone = {
  /** Background of tiles and chips. */
  tile: string;
  /** Text on that background (≥4.5:1). */
  ink: string;
  /** Solid dot beside the category name. */
  dot: string;
};

const TONES: CategoryTone[] = [
  { tile: "bg-[#fde6dc]", ink: "text-[#b53814]", dot: "bg-[#f2542d]" }, // tomato
  { tile: "bg-[#fdf0d5]", ink: "text-[#8a5a0b]", dot: "bg-[#e9a23b]" }, // mustard
  { tile: "bg-[#dff1e7]", ink: "text-[#1d6b45]", dot: "bg-[#2f9e63]" }, // basil
  { tile: "bg-[#efe7fb]", ink: "text-[#5b3fa8]", dot: "bg-[#8b6ce0]" }, // plum
  { tile: "bg-[#e0eef9]", ink: "text-[#1f5e94]", dot: "bg-[#3b8bd4]" }, // sky
  { tile: "bg-[#fce4ec]", ink: "text-[#a3294f]", dot: "bg-[#e0567f]" }, // rose
];

export function categoryTone(index: number): CategoryTone {
  return TONES[((index % TONES.length) + TONES.length) % TONES.length];
}
