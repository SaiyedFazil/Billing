import { BILL_PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { formatBillDate, formatBillTime } from "@/lib/utils/dates";
import { formatReceiptAmount, isZero } from "@/lib/utils/money";
import type { ReceiptData } from "@/types/bill.types";

import { ReceiptLogo } from "./ReceiptLogo";

export function Receipt80mm({
  receipt,
  narrow = false,
}: {
  receipt: ReceiptData;
  narrow?: boolean;
}) {
  const { shop } = receipt;

  return (
    <div className={narrow ? "receipt receipt--58" : "receipt"}>
      <div className="receipt-center">
        {/* The logo already says the name, so it is one or the other. */}
        {shop.showLogo ? (
          <ReceiptLogo className="receipt-logo" />
        ) : (
          <div className="receipt-shop-name">{shop.name}</div>
        )}
        {shop.addressLine ? <div>{shop.addressLine}</div> : null}
        {shop.phone ? <div>Ph: {shop.phone}</div> : null}
      </div>

      <hr />

      <table>
        <tbody>
          <tr>
            <td>Bill #{receipt.billNumber}</td>
            <td className="amt">{formatBillDate(receipt.businessDate)}</td>
          </tr>
          <tr>
            <td>Cashier: {receipt.cashierName}</td>
            <td className="amt">
              {formatBillTime(receipt.createdAt, shop.timezone)}
            </td>
          </tr>
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          <tr className="row-head">
            <td>ITEM</td>
            <td className="qty">QTY</td>
            <td className="amt">AMT</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          {receipt.lines.map((line, index) => (
            <tr key={`${line.itemName}-${index}`}>
              <td>{line.itemName}</td>
              <td className="qty">{line.quantity}</td>
              <td className="amt">{formatReceiptAmount(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td className="amt">{formatReceiptAmount(receipt.subtotal)}</td>
          </tr>
          {isZero(receipt.discount) ? null : (
            <tr>
              <td>Discount</td>
              <td className="amt">-{formatReceiptAmount(receipt.discount)}</td>
            </tr>
          )}
          <tr className="row-total">
            <td>TOTAL</td>
            <td className="amt">{formatReceiptAmount(receipt.total)}</td>
          </tr>
          <tr>
            <td>Paid: {BILL_PAYMENT_METHOD_LABELS[receipt.paymentMethod]}</td>
            <td className="amt">
              {formatReceiptAmount(receipt.tendered ?? receipt.total)}
            </td>
          </tr>
          {receipt.changeDue !== null ? (
            <tr>
              <td>Change</td>
              <td className="amt">{formatReceiptAmount(receipt.changeDue)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <hr />

      {shop.receiptFooter ? (
        <div className="receipt-center">{shop.receiptFooter}</div>
      ) : null}
    </div>
  );
}
