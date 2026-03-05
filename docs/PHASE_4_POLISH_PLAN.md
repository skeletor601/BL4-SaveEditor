# Phase 4: Polish Plan

**Context:** BL4 Editor is live at BL4Editor.com and works on desktop and phone. This phase is about polish, consistency, resilience, and small wins—not new major features.

**Order we're doing it:** **1. Mobile** → **2. Visual** → **3. Accessibility** → then the rest.

---

## 1. Mobile-first polish

**Goal:** Same “smoky grey transparent” language and clear feedback everywhere.

| Item | What to do | Priority |
|------|------------|----------|
| **Panel backgrounds** | Use the same `rgba(48,52,60,0.45)` + `backdrop-blur-sm` (or a shared class/variable) on other main content panels (Settings, Character subpages, Accessories sections, etc.) so the whole app feels consistent with the dashboard. | High |
| **Loading states** | Where we only show “Loading…” or a spinner, add skeleton placeholders or a consistent loading component so users know something is happening. | Medium |
| **Empty states** | When a list or result set is empty (e.g. no save selected, no search results), show a short, friendly message and maybe a CTA (e.g. “Select a save” or “Try a different search”) instead of a blank area. | Medium |
| **Success / error feedback** | Standardize how we show “Saved”, “Copied”, “Failed to load” (e.g. small toasts or inline messages) so the user always knows the outcome of an action. | Medium |

---

## 2. Mobile-specific polish

**Goal:** Comfortable use on phones; no tiny taps or overflow.

| Item | What to do | Priority |
|------|------------|----------|
| **Touch targets** | Ensure buttons and links are at least ~44px in the short dimension so they’re easy to tap; add padding/min-height where needed. | High |
| **Viewport & zoom** | Keep `viewport` meta and avoid `user-scalable=no` so pinch-zoom and font scaling work. | High |
| **Safe areas** | Use `env(safe-area-inset-*)` for any full-bleed or fixed UI (header/footer) on notched devices so content isn’t hidden. | Low |
| **Long forms** | On builder pages (Class Mod, Grenade, etc.), consider sticky “Submit” / “Encode” so users don’t have to scroll to the bottom on small screens. | Low |

---

## 3. Accessibility (a11y)

**Goal:** Usable with keyboard and screen readers; clear focus and labels.

| Item | What to do | Priority |
|------|------------|----------|
| **Focus visible** | Keep/expand `:focus-visible` styling so keyboard users always see where focus is. | High |
| **ARIA & labels** | Add `aria-label` (or visible labels) to icon-only buttons (e.g. theme, menu, copy). Ensure form fields have `<label>` or `aria-labelledby`. | High |
| **Landmarks** | Use `<main>`, `<nav>`, `<header>`, `<footer>` where appropriate so screen readers can jump by region. | Medium |
| **Contrast** | Spot-check text/background contrast on all themes (especially accent text on dark) and tweak if anything fails WCAG AA. | Medium |

---

## 4. SEO & shareability

**Goal:** BL4Editor.com looks good in search and when shared (links, social).

| Item | What to do | Priority |
|------|------------|----------|
| **Meta description** | Add `<meta name="description" content="...">` in `index.html` (or via React Helmet) with a one-sentence description of the web editor. | High |
| **Open Graph** | Add `og:title`, `og:description`, `og:url` (and optionally `og:image`) so links to BL4Editor.com preview nicely in Discord, Twitter, etc. | Medium |
| **Page titles** | Consider per-route `<title>` (e.g. “Dashboard – BL4 Editor”, “Master Search – BL4 Editor”) for bookmarks and history. | Low |

---

## 5. Error handling & resilience

**Goal:** Clear messages when something goes wrong; no dead-ends.

| Item | What to do | Priority |
|------|------------|----------|
| **API errors** | Where we call the API, show a short, user-friendly message on failure (e.g. “Couldn’t load data. Check your connection and try again.”) and optionally a retry button. | High |
| **Offline hint** | If a request fails with a network error, show a one-line “You might be offline” (or similar) so users don’t assume the site is broken. | Medium |
| **Save/encode errors** | For decrypt/encode/add-to-backpack, surface the server’s error message in a readable way (e.g. in the same panel or a small toast) so power users can debug. | Medium |

---

## 6. Content & copy

**Goal:** README and in-app text reflect the live web app and credit correctly.

| Item | What to do | Priority |
|------|------------|----------|
| **README** | Add a “Web version” section: link to **https://BL4Editor.com**, one sentence on what it does (save editing, Master Search, etc.), and “No install; works in the browser and on phone.” | High |
| **Settings / Credits** | Ensure “Credits” (or About) mentions Superexboom, modders, and optionally link to repo and/or desktop releases. Already partly there; just verify and add BL4Editor.com if missing. | Medium |
| **News / dashboard** | Keep the “Repo: …” and Discord message up to date; optionally add “Web: https://BL4Editor.com” so first-time visitors know where they are. | Low |

---

## 7. Technical / code polish (optional)

**Goal:** Small cleanups that reduce confusion or improve maintainability.

| Item | What to do | Priority |
|------|------------|----------|
| **parseSave stub** | `parseSave.ts` is a stub with TODOs. Either add a short comment that “client-side parsing is optional; server does the work” or leave as-is; no urgency. | Low |
| **Version endpoint** | Settings fetches `/api/version` (or similar); confirm it returns something useful for “Version (EXE)” or rename to “Backend version” if that’s what it is. | Low |
| **Env / config** | If we ever add more env-driven config (e.g. feature flags), document in README or a small `docs/CONFIG.md`. | Low |

---

## 8. Ideas (optional / later)

**Nice-to-haves that fit “polish” or “delight”:**

- **PWA:** Add a minimal `manifest.json` and service worker so the site can be “Add to Home Screen” and feel app-like on mobile. Optional; only if you want installability.
- **Theme from system:** Detect `prefers-color-scheme` and default the theme (e.g. dark) for first-time visitors.
- **Dashboard shortcuts:** “Last used” or “Resume” (e.g. “Continue to Character” if they had a save last time) using `localStorage`—lightweight and helpful.
- **Keyboard shortcuts:** One or two global shortcuts (e.g. Ctrl+K for Master Search) for power users.
- **Copy confirmation:** Where we copy to clipboard (codes, Base85), show a short “Copied!” toast so users don’t double-tap.
- **Rate limiting / abuse:** If the API ever gets hammered, consider a simple rate limit or CAPTCHA on expensive endpoints; only if it becomes a problem.

---

## Suggested order of work

1. **Quick wins (1–2 sessions):** Meta description + OG tags; README web section; consistent panel style on Settings (and one other high-traffic page).
2. **Resilience (1 session):** API error messages + optional retry; one “offline” hint on a central API call.
3. **A11y (1 session):** Focus visible check; aria-labels on icon buttons and key form controls.
4. **Mobile (1 session):** Touch target audit; safe areas if needed.
5. **Rest:** Empty states, loading skeletons, and “Ideas” as time allows.

---

## Summary

| Category | Focus |
|----------|--------|
| **Visual** | Smoky panels everywhere; loading/empty states; consistent success/error feedback. |
| **Mobile** | Touch targets; viewport; safe areas; sticky actions on long forms. |
| **A11y** | Focus, ARIA/labels, landmarks, contrast. |
| **SEO** | Meta description; OG tags; optional per-route titles. |
| **Resilience** | Clear API/offline errors; retry where it makes sense. |
| **Content** | README web section; Credits; optional “Web: BL4Editor.com” in news. |
| **Ideas** | PWA, system theme, dashboard shortcuts, copy toasts, keyboard shortcut. |

You can tackle these in any order; the table and “Suggested order” are there to prioritize. When something is done, tick it off in this doc or move it to a “Done” section so Phase 4 stays easy to track.
