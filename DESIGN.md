---
name: Solar Review
description: Solar repair for homes whose installer is gone. Free evaluation, plain answers.
colors:
  lime: "#8DC63F"
  ink: "#1A1A1A"
  cream: "#F3EDE3"
  cream-deep: "#EDE5D8"
  paper: "#FDFAF6"
  stone: "#7A746C"
  line: "#DDD6C8"
  footer-ink: "#111111"
  error: "#D94F4F"
typography:
  display:
    fontFamily: "Playfair Display, serif"
    fontSize: "clamp(2.8rem, 5vw, 4.8rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Playfair Display, serif"
    fontSize: "clamp(1.9rem, 2.8vw, 2.7rem)"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 300
    lineHeight: 1.8
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    letterSpacing: "0.16em"
rounded:
  field: "9px"
  card: "12px"
  card-lg: "16px"
  pill: "100px"
spacing:
  section-y: "96px"
  section-x: "48px"
  section-x-mobile: "20px"
  container: "1060px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "14px 34px"
  button-primary-hover:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
  button-accent:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "14px 34px"
  input:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  slot-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "10px"
    padding: "14px 16px"
---

# Design System: Solar Review

## Overview

**Creative North Star: "The Trusted Local Technician"**

The site should feel like the technician who shows up on time, looks at the actual equipment and explains the problem straight: calm, competent, unhurried, nothing to sell. Pages answer the homeowner's question first, then offer one clear next step (book the free evaluation, or call).

This file records the system **as built on 2026-11-24**, which is the reference for the planned evolution. Direction confirmed with Dennis: **evolve, don't replace.** The lime green and the Solar Review logo stay. Fonts, background color and layout may change in the evolution; until a new direction is chosen and this file is rewritten, the tokens above remain the normative system for any page built today.

Known weaknesses of the current build (from the 2026-11-24 Impeccable audit), to fix in the evolution: lime used as small text on cream (about 1.7:1 contrast); small uppercase labels above nearly every heading; muted body text near 10–11px; glow and side-bar accents; short slogan lines. These read as a generic template rather than a local technician.

**Key Characteristics:**
- Warm off-white (cream) page, near-black ink, one lime accent.
- Serif display headings (Playfair Display) over light sans body text (Inter 300).
- Fully rounded pill buttons; softly rounded cards and fields.
- Flat surfaces with hairline borders; shadows only on the fixed nav when scrolled and on floating elements.
- Mobile-first booking flow with time slots shown directly in the form.

## Colors

One accent on warm neutrals: lime does the work of brand and emphasis, everything else stays quiet.

### Primary
- **Field Lime** (#8DC63F): the brand color and the evolution's one fixed visual commitment. Fills primary-accent buttons, dots, rules and highlighted words. On cream or white it is too light for text; use it as a fill (with ink text on top) or on dark backgrounds.

### Neutral
- **Workshop Ink** (#1A1A1A): headings, body text on light backgrounds, the dark primary button, the trust bar and dark sections.
- **Morning Cream** (#F3EDE3): default page background and input fill. Open to change in the evolution.
- **Deep Cream** (#EDE5D8): alternate section background for rhythm.
- **Paper** (#FDFAF6): cards, slot buttons, focused inputs.
- **Stone** (#7A746C): secondary text, field labels, captions. Must not be used below about 14px on cream; contrast is borderline.
- **Hairline** (#DDD6C8): borders, dividers, FAQ rules.
- **Footer Ink** (#111111): footer background.
- **Error Red** (#D94F4F): field errors (darken it for text use; currently about 3.9:1).

### Named Rules
**The Lime Is a Fill Rule.** Lime carries buttons, marks and dark-background text. Never set lime text on cream, paper or white.

## Typography

**Display Font:** Playfair Display (serif fallback). Open to change in the evolution.
**Body Font:** Inter (sans-serif fallback). Open to change in the evolution.

**Character:** a classic editorial serif for headings over a light, airy sans. Warm and trustworthy, but the very light body weight (300) and tiny labels hurt readability for older homeowners.

### Hierarchy
- **Display** (500, clamp 2.8–4.8rem, 1.08): page H1 in the hero; an italic lime word for emphasis on dark backgrounds.
- **Headline** (500, clamp 1.9–2.7rem, 1.18): section H2s.
- **Body** (300, 1rem, 1.8): hero sub-copy and paragraphs; hero sub-copy capped near 460px.
- **Label** (600, 0.7rem, 0.16em tracking, uppercase, lime): eyebrow labels above headings. Overused today; the evolution should cut most of them.

### Named Rules
**The Readable Floor Rule.** No text the homeowner must read goes below 14px (0.875rem), and body copy uses weight 400 or more on light backgrounds.

## Layout

Single centered column of full-width sections (96px vertical, 48px side padding, 20px on phones) with content capped at 1060px. Breakpoints at 880px (two-column grids collapse, FAQ stacks) and 600px (phone spacing). Fixed translucent cream nav with a large logo. The booking page puts the form and the time slots on one screen. Sections alternate cream and deep cream, with dark bands (trust bar, Powerwall, CTA band) for emphasis.

## Elevation & Depth

Mostly flat: depth comes from tonal section changes and hairline borders, not shadow. Shadows appear on the nav once scrolled (`0 2px 24px rgba(0,0,0,0.06)`), on floating elements such as the mobile call bar (`0 -4px 24px rgba(0,0,0,0.3)`), and as a lime glow on some accent buttons (`0 4px 12px rgba(141,198,63,0.3)`). The glow is one of the template tells to remove.

## Shapes

Fully rounded pills for buttons, chips and tags (100px). Soft corners elsewhere: fields 9px, slot buttons 10px, cards 12px, large cards 16px. Small circular dots (3–6px, lime) as bullets and separators.

## Components

### Buttons
- **Shape:** pill (100px).
- **Primary (dark):** ink fill, cream text, 14px 34px, 0.82rem semibold uppercase with 0.05em tracking. Hover turns lime and lifts 2px.
- **Accent (lime):** lime fill, ink text, bold uppercase; hover dims slightly and lifts 1px.
- **Ghost:** transparent with a 1.5px translucent ink border; hover darkens the border.

### Inputs / Fields
- **Style:** cream fill, hairline border, 9px corners, 9px 12px padding, 0.9rem text.
- **Focus:** border turns lime, fill turns paper.
- **Error:** red border; labels sit above in small uppercase stone text (too small today, and not programmatically attached to the inputs on `/book`).

### Booking Slot Button
Full-width paper button listing a time window, with a lime arrow; hover adds a lime border and a faint lime tint. The core of the booking flow.

### Navigation
Fixed translucent cream bar with a blurred backdrop, hairline bottom border and the large Solar Review logo; links collapse on phones, with a call action kept reachable.

### FAQ List
Stacked questions separated by hairline rules; question in semibold ink, answer in light stone text. Paired with FAQPage structured data that must match word for word.

## Do's and Don'ts

### Do:
- **Do** keep Field Lime (#8DC63F) and the Solar Review logo in any evolution.
- **Do** use lime as a fill or on dark backgrounds, with ink text on lime fills.
- **Do** keep one clear primary action per section: book the free evaluation, with the phone number as fallback.
- **Do** keep the booking form and time slots together on `/book`.

### Don't:
- **Don't** set lime text on cream, paper or white.
- **Don't** put readable text below 14px or use weight 300 for body copy on light backgrounds.
- **Don't** add an uppercase eyebrow label above every heading.
- **Don't** add glows, side-bar accent stripes or decorative gradients.
- **Don't** use customer job photos, invented testimonials or invented statistics as decoration.
