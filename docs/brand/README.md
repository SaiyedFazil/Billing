# Mobito brand assets

`mobito-logo-source.pdf` is the master: the shop's logo as delivered from
Adobe Illustrator, all vector, lettering already outlined. Every file below was
generated from it, keeping its exact shapes and colours. To change the logo,
change the master and regenerate. Never redraw it by hand.

## Files

| File (in `public/brand/` unless noted)                        | What it is                                        | Used for                                       |
| ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `mobito-logo.svg`                                             | Full logo: wordmark, smile and tagline            | Light backgrounds with room: sign-in on phones |
| `mobito-logo-dark.svg`                                        | Full logo with a cream "mo"                       | Dark backgrounds: the sign-in brand panel      |
| `mobito-wordmark.svg`                                         | Wordmark and smile, no tagline                    | Light, smaller spaces: the 404 page            |
| `mobito-wordmark-dark.svg`                                    | Wordmark with a cream "mo"                        | The espresso sidebar and phone top bar         |
| `mobito-logo-mono.svg`                                        | Full logo, solid black                            | Anything printed (reference copy)              |
| `mobito-mark.svg`                                             | The "m + smile" on a crimson tile                 | Where the wordmark will not fit                |
| `icon-192.png` · `icon-512.png`                               | The mark as PNG                                   | Web app manifest                               |
| `icon-maskable-512.png`                                       | Full-bleed mark, artwork inside the safe circle   | Android home screens                           |
| `src/app/icon.svg` · `favicon.ico`                            | The mark (the `.ico` holds 16, 32 and 48 px)      | Browser tabs                                   |
| `src/app/apple-icon.png`                                      | 180 px full-bleed square (iOS rounds the corners) | iPhone and iPad home screens                   |
| `ReceiptLogo.tsx` in `src/components/pages/print/components/` | The mono logo as inline SVG                       | The printed receipt                            |

In the app, use the components in `src/components/layout/`, not the files
directly: `BrandLogo` picks the right file for the background, and `BrandMark`
is the tile.

## Colours

| Role                     | Value                                            |
| ------------------------ | ------------------------------------------------ |
| Crimson ("mo", the tile) | `#B31615`                                        |
| Gradient ("bito", smile) | `#FDC70C` → `#F3903F` → `#ED683C`, right to left |
| Tagline                  | `#F7941D`                                        |
| Cream ("mo" on dark)     | `#FFF4E8`                                        |

These are the logo's own colours, not UI tokens. The app's buttons and
highlights keep the Ember palette in `src/app/globals.css`.

## Rules

- **Pick by background.** Crimson "mo" on light, cream "mo" on dark. The
  crimson almost disappears on the espresso sidebar.
- **Drop the tagline when it gets small.** Below about 160 px wide it can't be
  read; use the wordmark.
- **The receipt is always black.** Thermal printers print one colour, and a
  gradient prints as a grey smudge. `ReceiptLogo` is inline SVG, so it is on
  the page the moment the print dialog opens; an `<img>` might not be.
- **Never stretch, recolour, outline or add effects** to the logo, and keep
  clear space around it of at least the height of the "i" dot.
- **Signed-out pages need these files.** `src/proxy.ts` exempts `brand/`, the
  icons and the manifest from the sign-in redirect; keep them exempt.
