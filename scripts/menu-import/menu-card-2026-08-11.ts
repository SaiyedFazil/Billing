/**
 * The Mobito menu card dated 11 Aug 2026 ("New Menu Card 11 08 26.pdf"),
 * transcribed in the order the card lists it. Read by `npm run db:import-menu`.
 *
 * Names follow the card, with three kinds of tidy-up so the till and the
 * receipt read cleanly:
 *   - Title Case and single spaces ("Chicken Ginger burger" → "…Burger").
 *   - "6inch" → "6 inch", "( 750 g )" → "(750 g)".
 *   - The card's "Arebian" is spelled "Arabian".
 *
 * Page 3's three signature bowls each sit under their own heading, so they
 * share one "Mobito Specials" category; what is in each is noted beside it.
 *
 * Prices are rupees as exact decimal strings — never numbers. See CLAUDE.md
 * rule 1.
 */

import type { MenuCardCategory } from "./plan";

/** Recorded on every audit row the import writes, so its origin is traceable. */
export const MENU_CARD_SOURCE = "menu-card-2026-08-11";

export const MENU_CARD: MenuCardCategory[] = [
  // --- page 1 -------------------------------------------------------
  {
    name: "Burgers",
    items: [
      { name: "Chicken Ginger Burger", price: "130.00" },
      { name: "Fish Burger", price: "180.00" },
      { name: "Chicken Cream Cheese Burger", price: "150.00" },
      { name: "Chicken Kurkure Burger", price: "190.00" },
      { name: "Double Decker/Open Burger", price: "200.00" },
    ],
  },
  {
    name: "Rice Bowl",
    items: [
      { name: "Regular Rice Bowl", price: "170.00" },
      { name: "Large Rice Bowl", price: "220.00" },
      { name: "Sp. Rice Bowl (750 g)", price: "250.00" },
      { name: "Extra Large Rice Bowl", price: "270.00" },
    ],
  },
  {
    name: "Sandwich",
    items: [{ name: "Chicken Sandwich", price: "150.00" }],
  },
  {
    name: "Pizza",
    items: [{ name: "Chicken Pizza (6 inch)", price: "120.00" }],
  },
  {
    name: "Fries",
    items: [
      { name: "Salted Fries", price: "70.00" },
      { name: "Peri Peri Fries", price: "80.00" },
      { name: "Cheese Fries", price: "150.00" },
    ],
  },

  // --- page 2 -------------------------------------------------------
  {
    name: "Tacos / Wrap",
    items: [
      { name: "Chicken Tacos", price: "150.00" },
      { name: "Chicken Wrap Roll", price: "160.00" },
      { name: "Fish Tacos", price: "210.00" },
      { name: "Fish Wrap Roll", price: "210.00" },
    ],
  },
  {
    name: "Bowl",
    items: [
      { name: "Chicken Bowl", price: "150.00" },
      { name: "Fish Bowl", price: "180.00" },
      { name: "BBQ Bowl", price: "170.00" },
      { name: "Cheese Bowl", price: "170.00" },
      { name: "Chicken Peri Peri Bowl", price: "170.00" },
      { name: "Achari Bowl", price: "200.00" },
      { name: "American Bowl", price: "200.00" },
      { name: "Afghani Bowl", price: "200.00" },
      { name: "Extra Crunch Bowl", price: "200.00" },
      { name: "Arabian Bowl", price: "230.00" },
      { name: "Sp. Mobito Bowl", price: "250.00" },
    ],
  },
  {
    name: "Popcorn / Finger",
    items: [
      { name: "Chicken Popcorn (12 Pcs.)", price: "110.00" },
      { name: "Chicken Finger (7 Pcs.)", price: "120.00" },
      { name: "Fish Popcorn (15 Pcs.)", price: "180.00" },
    ],
  },
  {
    name: "French Fries Bowl",
    items: [
      { name: "French Fries Afghani Bowl", price: "200.00" },
      { name: "French Fries American Bowl", price: "200.00" },
      { name: "French Fries Arabian Bowl", price: "230.00" },
    ],
  },

  // --- page 3 -------------------------------------------------------
  {
    name: "Mobito Specials",
    items: [
      // Peri Peri Pasta + Chicken
      { name: "Mobito Fire Bowl", price: "250.00" },
      // Signature Pasta + Chicken
      { name: "Mobito Signature Bowl", price: "250.00" },
      // French Fries + Pasta + Chicken
      { name: "Mobito Jumbo Bowl", price: "300.00" },
    ],
  },
];
