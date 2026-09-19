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

| Setting | Value |
|---|---|
| Destination | Your thermal printer |
| Paper size | 80mm x 297mm (or "Roll Paper 80mm") |
| Margins | None |
| Scale | 100% (Default) |
| **Headers and footers** | **UNCHECKED** |
| Background graphics | Unchecked |

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
