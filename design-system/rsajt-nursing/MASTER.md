# RSAJT Nursing — Design System MASTER

> Source of Truth. Do not override without reason. Page-specific overrides go in `pages/<page>.md`.

---

## Product Profile

- **Type**: Enterprise Healthcare Dashboard (Internal Operational Tool)
- **Audience**: Nurses, Midwives, Admin staff at RSAJT hospital
- **Style Direction**: Modern Clinical Editorial
- **Feel**: Calm · Trustworthy · Precise · Mature · Institutional · Human
- **Density**: High (dashboard = 8–32px spacing scale)
- **Motion**: Subtle only (reduced-motion respected)
- **Variance**: Centered / Consistent (no asymmetric boldness)

---

## Color Tokens

**Identity: Ocean Blue.** Calm, medical, trustworthy — never green, never
neon/electric, never gaming-blue. Most surfaces stay neutral/cool; blue is
reserved for brand, primary actions, active navigation, links, selection and
focus states.

Tokens are declared once in `src/app/globals.css` (`@theme`) and exposed to
Tailwind v4 as semantic utilities (`bg-primary`, `text-muted-foreground`,
`border-border`, `bg-surface`, `text-danger`, …). Prefer these over raw hex or
raw palette shades (`blue-600`, `slate-200`). Reference values below are the
resolved colours after transpilation.

```css
/* Brand — Ocean Blue */
--color-primary:            #0079B4; /* deep ocean blue — action, links */
--color-primary-hover:      #0A699B; /* sea blue (darker) */
--color-primary-active:     #0B5A86;
--color-primary-subtle:     #EAF4FA; /* very light aqua — tinted bg */
--color-primary-muted:      #CDE7F4; /* light aqua */
--color-primary-foreground: #FFFFFF;

/* Structure / accent */
--color-secondary:          #0F4C81; /* deep ocean */
--color-accent:             #7FC6E0; /* light aqua */

/* Surfaces */
--color-background:         #F6F9FB; /* very light cool blue */
--color-surface:            #FFFFFF;
--color-surface-raised:     #F1F5F8; /* very subtle cool surface */
--color-surface-sunken:     #E9EFF3;

/* Text */
--color-foreground:         #182B3C; /* deep navy */
--color-muted-foreground:   #5A6B7B; /* cool gray-blue */

/* Borders / focus */
--color-border:             #E3EAEF; /* very light blue-gray */
--color-border-strong:      #C9D5DD;
--color-ring:               #0079B4; /* focus ring = primary */

/* Semantic */
--color-success:            #168F58;  --color-success-subtle: #ECFAF1;
--color-warning:            #C77A15;  --color-warning-subtle: #FEF6E7;
--color-danger:             #DC2626;  --color-danger-subtle:  #FEF2F2;
--color-info:               #0284B8;  --color-info-subtle:    #EAF4FA;
```

**Motion tokens** (CSS-first; no JS animation library is added for app UI):

```css
--duration-fast:   150ms;
--duration-normal: 220ms;
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);
--ease-out-quint:  cubic-bezier(0.22, 1, 0.36, 1);
```

Utility classes: `.animate-enter` (page/route entrance), `.animate-dialog-in`
(modal), `.animate-overlay-in` (overlay fade), `.animate-drawer-in` (side panel),
`.stagger-children` (30–80 ms staggered section entrance). All are disabled under
`prefers-reduced-motion: reduce`.

**Contrast**: All text/bg pairs must pass WCAG AA (4.5:1 normal, 3:1 large).

---

## Typography

**Primary font**: Inter (Google Fonts — variable, Indonesian support, tabular numerals)  
**Mono font**: JetBrains Mono (code, numeric IDs)

```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs:   0.75rem;   /* 12px — caption, label */
--text-sm:   0.875rem;  /* 14px — body small, table */
--text-base: 1rem;      /* 16px — body */
--text-lg:   1.125rem;  /* 18px — section header */
--text-xl:   1.25rem;   /* 20px — page subtitle */
--text-2xl:  1.5rem;    /* 24px — page title */
--text-3xl:  1.875rem;  /* 30px — KPI number */
--text-4xl:  2.25rem;   /* 36px — display */

/* Weight */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line height */
--leading-tight:  1.25;
--leading-snug:   1.375;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
```

**Rules**:
- Body minimum: 14px (--text-sm) for dense tables
- KPI numbers: --text-3xl, --font-bold, tabular-nums
- Never less than 12px for any visible text
- Line-height 1.5 for body, 1.25 for headings

---

## Spacing Scale (Dense Dashboard)

```css
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
```

---

## Border Radius

```css
--radius-sm:  0.25rem;  /* 4px — badge, chip */
--radius-md:  0.375rem; /* 6px — input, button */
--radius-lg:  0.5rem;   /* 8px — card */
--radius-xl:  0.75rem;  /* 12px — modal, panel */
--radius-full: 9999px;  /* pill */
```

No giant rounded cards (no `rounded-2xl` on full-page cards).

---

## Shadow

```css
--shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md:  0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08);
--shadow-lg:  0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07);
```

Use border + subtle shadow, not giant shadows. Depth = surface contrast + border.

---

## Motion

```css
--duration-fast:   150ms;
--duration-normal: 220ms;
--duration-slow:   350ms;
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
```

**Rules**:
- Page transition: `opacity 0→1` + `translateY 6px→0`, 220ms
- Modal: `scale(0.97)→1` + `opacity`, 220ms
- Drawer: `translateX(100%)→0`, 250ms
- Always: `@media (prefers-reduced-motion: reduce) { transition: none }`

---

## Status Semantics

| Status | Color Token | Usage |
|--------|-------------|-------|
| ACTIVE / APPROVED | `--color-success` | Valid, done |
| EXPIRING (< 90 days) | `--color-warning` | Needs attention |
| EXPIRED / REJECTED | `--color-danger` | Blocking |
| PENDING / SUBMITTED | `--color-info` | In progress |
| DRAFT | `--color-text-muted` | Unsubmitted |
| LIFETIME | `--color-primary` | Permanent |
| MISSING | `--color-danger` | Critical gap |

Status badge = text label + color dot. Never rely on color alone.

---

## Layout

```
Desktop (≥1024px):
┌─────────────────────────────────────────────┐
│ Sidebar (240px) │ Topbar (full width)        │
│                 ├─────────────────────────── │
│                 │ Main content (flex-1)      │
│                 │  padding: 24px             │
└─────────────────────────────────────────────┘

Tablet (768–1023px): Sidebar collapses to icon-only (56px)
Mobile (<768px):    Sidebar = bottom drawer + bottom nav
```

---

## Component Conventions

### Sidebar
- Width: 240px expanded, 56px collapsed
- Items: icon + label, grouped by module
- Active state: left border accent + subtle bg
- No flat list of 20 buttons

### Topbar
- Height: 56px
- Contains: breadcrumb (left), search + notification + avatar (right)
- Border-bottom: `--color-border`

### DataTable
- Sticky thead
- Horizontal scroll on mobile
- Row height: 48px (comfortable) or 40px (dense)
- Sortable: icon rotates
- Pagination: items-per-page + page numbers
- States: loading skeleton, empty, error

### Forms
- Label above input (never placeholder-only)
- Inline validation error below field
- Groups: Identitas / Kepegawaian / Legalitas / Kompetensi / Dokumen
- No single giant form

### KPI Cards
- Not all identical — use hierarchy (primary KPI larger)
- Number: --text-3xl bold
- Label: --text-sm secondary
- Trend: small arrow + delta

---

## Anti-patterns (Prohibited)

- ❌ Purple-blue AI gradients
- ❌ Glowing blobs / decorative blur
- ❌ Glassmorphism on operational screens
- ❌ Giant rounded cards (no `rounded-3xl` on content cards)
- ❌ Excessive floating cards
- ❌ Random 3D / parallax on tables/forms
- ❌ Fake animated counters
- ❌ Rainbow charts
- ❌ Emoji as UI icons
- ❌ Placeholder-only form labels
- ❌ Errors only at top of form
- ❌ Excessive badge/pill decoration
- ❌ Generic SaaS gradient hero sections

---

## Human Design Test

> Remove all gradients, shadows, and animations. Is the information hierarchy still excellent?

If no → redesign the hierarchy first.

---

## AI-Slop Rejection Test

Reject any page containing:
`gradient background + glass cards + purple glow + floating blobs + huge heading + random chart + AI sparkle icon`

---

*Generated: 2026-10-03 | Stack: Next.js 15 + TypeScript + Tailwind + shadcn/ui + Prisma*
