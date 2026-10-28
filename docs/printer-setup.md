# Thermal Printer Setup

One-time setup on the till computer. Takes about five minutes.

## 1. Install the printer

Connect the thermal printer by USB and install the driver that came with it (or
download it from the manufacturer). Windows lists it under
**Settings → Bluetooth & devices → Printers & scanners**.

**Print a Windows test page before continuing.** If that does not work, nothing
in the billing app will either.

## 2. Make it the default printer

**Settings → Bluetooth & devices → Printers & scanners** → click the thermal
printer → **Set as default**.

Then turn **off** "Let Windows manage my default printer" at the bottom of that
page. Otherwise Windows silently switches the default back to something else
and receipts start coming out of the wrong printer.

## 3. Configure Chrome (once)

Open any receipt in the billing app. When the print dialog appears, set:

| Setting                 | Value                               |
| ----------------------- | ----------------------------------- |
| Destination             | Your thermal printer                |
| Paper size              | 80mm x 297mm (or "Roll Paper 80mm") |
| Margins                 | None                                |
| Scale                   | 100% (Default)                      |
| **Headers and footers** | **UNCHECKED**                       |
| Background graphics     | Unchecked                           |

Chrome remembers these per printer, so this is a one-time job.

> **If "Headers and footers" stays checked**, every receipt prints with the page
> URL and the date across the top and bottom. This is by far the most common
> setup mistake.

## 4. Test

Create a real bill and print it. Check that:

- Nothing is cut off on the right edge
- The item, quantity and amount columns line up
- There is no URL or page number printed
- The paper cuts or tears cleanly after the footer

## Switching to a 58mm printer

The owner changes this in the app under **Settings → Printer width** (available
from M6). No reinstall needed — pick **58mm** and print a test receipt.

## Printing from a phone

Phones print the same receipt through the phone's own print system. Set each
phone up once.

### Android

1. **Connect the printer.** For Bluetooth, pair it in the phone's Bluetooth
   settings. For Wi-Fi, put the printer on the shop's Wi-Fi (its manual says
   how) and keep the phone on the same network.
2. **Install a print service.** Android prints only to printers that have
   one. Install the printer maker's print app from the Play Store, or a
   general one for thermal printers such as RawBT, and switch it on under
   **Settings → Connected devices → Printing**. Check that your printer model
   works with it before relying on it.
3. **Print a test receipt.** Save a bill. When Chrome's print preview opens,
   pick the thermal printer and set the paper size to **80mm** (or **58mm**),
   margins to **None**, and **Headers and footers** off. Chrome remembers
   these per printer.

### iPhone

An iPhone prints only to **AirPrint** printers. If the printer's box or manual
does not list AirPrint, iPhones can do everything in the app except print;
reprint those bills later from an Android phone or the till.

If the app is installed on the home screen and the print sheet does not
appear, open the app in a Safari tab and print from there.

### The Print button

Under every receipt on a phone there is a **Print** button. Use it when the
print sheet was closed by mistake, or never opened: a phone has no Ctrl+P.
**Back to billing** returns to the till for the next customer.

## Troubleshooting

**The print dialog does not open by itself.**
Chrome blocks automatic printing until the page has been interacted with. Press
**Ctrl+P**. This usually only happens on the very first receipt after a browser
restart.

**The receipt prints on A4.**
The paper size in the Chrome print dialog is wrong. Repeat step 3.

**Text is tiny or enormous.**
Scale is not at 100%. Repeat step 3.

**The receipt is cut off on the right.**
Margins are not set to None, or the paper size is wider than the roll. Repeat
step 3.

**Nothing prints and there is no error.**
Windows has switched the default printer. Repeat step 2, including turning off
"Let Windows manage my default printer".
