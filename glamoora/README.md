# Glamoora — Beauty Services Marketplace (Hackathon MVP)

Built from the **Glamoora PRD v1.0** and the official Glamoora logo (brand rose `#A87182`).

A mobile-first, fully self-contained web app (one `index.html`, zero dependencies, works offline).
Data lives in a seeded local database that mirrors the PRD schema (`users`, `provider_profiles`,
`categories`, `services`, `portfolio_items`, `availability`, `blocked_slots`, `bookings`,
`reviews`, `favourites`, `notifications`).

## Run it
- Just open `index.html` in any browser, **or**
- `python3 -m http.server 8080 --directory /home/user/glamoora` → http://localhost:8080

## Demo accounts (password `demo123`, or use the one-tap buttons)
| Role | Email |
|---|---|
| Customer | `maya@glamoora.my` |
| Beauty professional | `aina@glamoora.my` |
| Admin | `admin@glamoora.my` |

## PRD coverage
**Customer journey** — Discover (home) → search + filters (category, price, rating, distance,
service type, open today; sort by recommended/distance/rating/price) → provider profile
(services, portfolio, reviews, hours) → pick service → date (14 days) → time slot → summary →
confirm → pending booking → provider accepts → confirmed → completed → **review** (1–5 stars)
→ provider rating updates.

**Provider journey** — Studio dashboard (today / pending / upcoming / earnings / rating +
onboarding checklist) → accept / decline / complete / no-show / cancel bookings → week calendar
with blocked slots → services CRUD (price, duration, location type, active toggle) → availability
(working days, hours, breaks, blocked dates) → studio profile + portfolio management.

**Admin** — marketplace overview metrics, verify / suspend / reactivate providers, toggle
categories, adjust any booking status, user directory.

**Rules enforced**
- Slots are generated from working windows minus breaks, blocked slots and existing bookings
  (30-min grid, lead time, closed days disabled)
- **Double / overlapping bookings are rejected** at creation (re-checked at confirm time)
- Reviews require a *completed* booking, one per booking; averages recompute
- Cancelled bookings free their slot for rebooking
- Suspended providers can't be booked; verification badge is honest (granted only by admin)
- Payments are mock ("pay after service") — no card data collected

## Suggested hackathon demo script
1. Log in as **Maya** (customer) → browse Lash Extensions → open *Aina Lash Studio*.
2. View portfolio + services → Book → pick a day → pick a slot → confirm.
3. Log out → log in as **Aina** (provider) → dashboard shows the pending request → **Accept**.
4. Back to Maya → booking is **Confirmed**. Aina marks it **Completed**.
5. Maya leaves a **5-star review** → Aina's rating updates.
6. Bonus: log in as **Admin** → verify a pending provider / suspend one.
7. Reset demo data any time from provider → Studio → Settings.

## Notes
- Single file by design: the logo is embedded (base64), all art is inline SVG — it works even
  with no network (useful for hackathon juries on bad Wi-Fi).
- Data persists in `localStorage` per browser; "Reset demo data" restores the seed.
- Seed dates are generated relative to *today*, so the dashboard/calendar always look alive.
