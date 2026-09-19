import { Flame } from "lucide-react";

import { BrandMark } from "@/components/layout/BrandMark";

const SAMPLE_LINES = [
  { qty: 2, name: "Cheese Burger", amount: "160.00" },
  { qty: 1, name: "Chicken Burger", amount: "110.00" },
  { qty: 1, name: "French Fries", amount: "40.00" },
  { qty: 2, name: "Coke Large", amount: "100.00" },
];

/** A tilted paper receipt — decoration only, so it is hidden from assistive tech. */
function ReceiptIllustration() {
  return (
    <div
      aria-hidden
      className="absolute top-[108px] right-[72px] hidden w-[270px] rotate-6 drop-shadow-[0_30px_40px_rgb(0_0_0/0.45)] xl:block [@media(max-height:780px)]:hidden"
    >
      <div className="flex flex-col gap-2.5 rounded-t bg-[#fffdf8] px-5 pt-5 pb-4 font-mono text-xs text-[#2a2420]">
        <div className="text-center">
          <p className="text-[13px] font-semibold tracking-[0.08em]">
            ORDER #1042
          </p>
          <p className="text-muted-foreground">Counter 1</p>
        </div>
        <span className="border-t border-dashed border-[#bdb3a8]" />
        {SAMPLE_LINES.map((line) => (
          <div key={line.name} className="flex justify-between gap-3">
            <span>
              {line.qty} x {line.name}
            </span>
            <span>{line.amount}</span>
          </div>
        ))}
        <span className="border-t border-dashed border-[#bdb3a8]" />
        <div className="text-muted-foreground flex justify-between">
          <span>Subtotal</span>
          <span>410.00</span>
        </div>
        <div className="text-muted-foreground flex justify-between">
          <span>Discount</span>
          <span>-10.00</span>
        </div>
        <div className="flex justify-between text-[15px] font-semibold">
          <span>TOTAL</span>
          <span>₹400.00</span>
        </div>
        <span className="border-t border-dashed border-[#bdb3a8]" />
        <p className="text-muted-foreground text-center">Thank you! Visit again</p>
      </div>
      {/* Torn-paper edge. */}
      <svg
        width="270"
        height="12"
        viewBox="0 0 270 12"
        preserveAspectRatio="none"
        className="block"
      >
        <path
          fill="#fffdf8"
          d="M0 0 L9 12 L18 0 L27 12 L36 0 L45 12 L54 0 L63 12 L72 0 L81 12 L90 0 L99 12 L108 0 L117 12 L126 0 L135 12 L144 0 L153 12 L162 0 L171 12 L180 0 L189 12 L198 0 L207 12 L216 0 L225 12 L234 0 L243 12 L252 0 L261 12 L270 0 Z"
        />
      </svg>
    </div>
  );
}

export function LoginBrandPanel() {
  return (
    <section className="bg-sidebar bg-dots text-sidebar-foreground relative hidden w-[52%] max-w-[760px] shrink-0 flex-col justify-between overflow-hidden px-14 py-14 lg:flex xl:px-16">
      <div className="relative z-10 flex items-center gap-3">
        <BrandMark className="size-11" />
        <span className="font-heading text-[22px] font-bold text-white">
          Billing
        </span>
      </div>

      <ReceiptIllustration />

      <div className="relative z-10 max-w-[520px] space-y-5">
        <span className="bg-brand/15 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#ff9b7a]">
          <Flame className="size-3.5" />
          Counter billing
        </span>
        <p className="font-heading text-[60px] leading-[0.98] font-extrabold tracking-[-0.035em] text-white xl:text-[72px]">
          Fast counter.
          <br />
          <span className="text-[#ff7a52]">Exact bills.</span>
        </p>
        <p className="max-w-[440px] text-[17px] leading-relaxed text-[#cfc6bd]">
          Take orders, print receipts and see the day&apos;s takings, all from
          one screen at the counter.
        </p>
        <p className="text-sidebar-muted pt-3 text-[13px]">
          Accounts are created by the shop owner.
        </p>
      </div>
    </section>
  );
}
