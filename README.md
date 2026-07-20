# PlatformPilot

**A cross-platform earnings & fuel-cost optimization system for gig delivery riders.**

PlatformPilot helps gig delivery riders in Tier-2/3 Indian cities decide which delivery platform to prioritize at any given hour, based on their own logged trip history — not scraped or assumed platform data.

---

## 1. The Problem

Riders working for platforms like Zomato, Swiggy, Rapido, and similar often log into 2-3 apps at once, deciding by gut feel which one to prioritize. A wrong guess doesn't just cost potential earnings — it burns fuel money driving toward a platform that turns out to be slow that hour. Fuel cost is one of the largest expense categories eating into a rider's take-home income, and this decision is made daily, repeatedly, with almost no data.

No platform will build cross-platform tooling for riders (it works against their own retention), and scraping competitor demand data is both legally risky and technically fragile. **The insight this project is built on:** a rider's own historical performance, properly logged, is a strong enough signal to make useful personal recommendations — without needing access to any platform's internal data.

---

## 2. Core Design Principle

This system only ever processes data the rider explicitly logs about their own activity. No scraping, no unofficial APIs, no third-party platform data. This keeps the project legally clean, technically honest, and still genuinely useful — personal pattern recognition over weeks of real data beats gut feel.

---

## 3. Architecture

```
┌─────────────────────┐        HTTPS/JSON        ┌──────────────────────┐
│   React Frontend     │ ────────────────────────▶│   Express Backend     │
│   (Vite, port 5173)  │◀──────────────────────── │   (Node, port 4000)   │
└─────────────────────┘                           └───────────┬──────────┘
                                                                │ Prisma ORM
                                                                ▼
                                                    ┌──────────────────────┐
                                                    │   PostgreSQL          │
                                                    │   (5 tables)          │
                                                    └──────────────────────┘
```

**Backend layers**, following separation of concerns:
- `routes/` — maps URLs to controller functions, applies auth middleware
- `controllers/` — the actual business logic for each feature
- `middleware/` — cross-cutting checks (JWT verification, role checks)
- `utils/prismaClient.js` — single shared database connection

**Frontend layers:**
- `pages/` — top-level routed views (Login, Signup, Dashboard)
- `components/` — reusable UI pieces (Sidebar, forms, tables, chart)
- `context/` — app-wide auth state, available anywhere via `useAuth()`
- `api/` — centralized backend calls, so components never call `axios` directly

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) | Fast dev server, industry-standard, component model fits a multi-view dashboard |
| Charts | Recharts | Declarative, React-native charting, no manual canvas work |
| Backend | Node.js + Express | Lightweight, unopinionated, easy to reason about route-by-route |
| Database | PostgreSQL | Relational, aggregation-heavy access pattern (group trips by platform/time-slot) fits SQL naturally |
| ORM | Prisma | Type-safe queries, migration management, avoids hand-written SQL for CRUD while keeping the schema explicit and reviewable |
| Auth | JWT + bcrypt | Stateless auth (no server-side session store needed), industry-standard password hashing |

---

## 5. Database Schema

Five tables. Full reasoning for each design decision (why UUIDs, why `day_of_week` is denormalized, why fuel cost is calculated at trip-time rather than live) is in `platformpilot-database-schema.md` — summarized here:

| Table | Purpose |
|---|---|
| `users` | Rider/admin accounts, role-based access via a `role` column |
| `vehicles` | Fuel efficiency per rider, referenced by trips for fuel cost calculation |
| `platforms` | Reference data — Zomato, Swiggy, etc. |
| `trips` | The core table — every logged trip, with platform, distance, earnings, and *pre-computed* fuel cost and net earning |
| `fuel_price_log` | Historical fuel prices, so old trips' fuel cost stays accurate even as prices change |

**Key relational design decision:** `fuel_cost_estimated` and `net_earning` are calculated once, at trip-creation time, using the fuel price *in effect on that date* — not recalculated live. This means a trip logged three months ago keeps showing an accurate historical cost even if today's fuel price is different, which is what makes the recommendation engine's "based on your last 30 days" claims trustworthy rather than silently drifting.

---

## 6. The Recommendation Engine

This is the project's centerpiece — a transparent, explainable weighted-scoring model, not a black-box library call.

**What it computes:** for every combination of *platform* and *time-slot* (5 time-of-day buckets × 2 day-type buckets = 10 slots per platform), a recency-weighted average of **net earning per kilometer** from the rider's own trip history.

**The formula, in plain terms:**

```
for each trip in a (platform, slot) group:
    net_per_km = trip.net_earning / trip.distance_km
    weight = 0.5 ^ (days_ago / HALF_LIFE_DAYS)

slot_score = Σ(net_per_km × weight) / Σ(weight)
```

**Three deliberate design decisions:**
1. **Net earning per km, not raw earnings** — normalizes for trip length, so a long low-value trip isn't mistaken for a good outcome. Directly reflects the fuel-cost question the project is about.
2. **Exponential recency decay (14-day half-life, configurable)** — a trip today counts fully; a trip 14 days old counts half as much; 28 days old, a quarter. Recent patterns matter more without discarding older data outright.
3. **Minimum trip-count threshold per slot (3 trips)** — a slot with only 1-2 logged trips is flagged `confident: false` rather than presented with false authority. This is a genuine statistical-honesty decision, not just a UI nicety.

Implementation: `controllers/recommendationController.js`.

---

## 7. API Reference

All routes except `/health`, `/auth/signup`, and `/auth/login` require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Server + database connectivity check |
| POST | `/api/auth/signup` | Create a rider account, returns JWT |
| POST | `/api/auth/login` | Authenticate, returns JWT |
| GET | `/api/me` | Returns the currently authenticated user's identity |
| GET | `/api/platforms` | List active platforms |
| POST | `/api/vehicles` | Register a vehicle for the logged-in rider |
| GET | `/api/vehicles` | List the logged-in rider's vehicles |
| POST | `/api/trips` | Log a trip; server computes fuel cost and net earning automatically |
| GET | `/api/trips` | List the logged-in rider's trips (filterable by platform, date range) |
| GET | `/api/recommendations` | Returns weighted-scored slots and the current top pick |

---

## 8. Synthetic Data

Real gig-platform data isn't accessible to this project (see §2). `scripts/generateSyntheticData.js` generates ~60 days of illustrative trip history with a **deliberately built-in pattern** (e.g., one platform boosted in evenings, another on weekday afternoons) so the recommendation engine has something real to detect during development and demos.

**Honesty note, worth repeating in any presentation of this project:** the specific earnings-per-km figures and platform "personalities" in the generator are illustrative starting estimates for demonstration purposes, not verified gig-economy research. Before presenting statistics from this data as representative, they should be recalibrated against published gig-economy earnings studies and, ideally, informal interviews with real riders — this is flagged as a first-priority follow-up, not an afterthought.

---

## 9. Setup

Full step-by-step setup (with exact commands and troubleshooting) is documented across the stage guides used to build this project:
1. Database schema & backend scaffold
2. Authentication API
3. Vehicles & trip logging API
4. Recommendation engine
5. Synthetic data generator
6. Frontend scaffold & auth pages
7. Dashboard UI

**Quick start**, assuming both `platformpilot-backend` and `platformpilot-frontend` are already set up per those guides:

```bash
# Terminal 1 — backend
cd platformpilot-backend
npm run dev        # http://localhost:4000

# Terminal 2 — frontend
cd platformpilot-frontend
npm run dev         # http://localhost:5173
```

Demo account with pre-loaded synthetic data: `demo.rider@platformpilot.test` / `demo1234`.

---

## 10. Known Limitations (stated honestly, not glossed over)

- **No real rider validation yet.** All current data is either manually tested or synthetically generated. Real-world validation with even a handful of actual riders would meaningfully strengthen this project's credibility — currently the single biggest gap between "working prototype" and "validated product."
- **Single active vehicle per rider in the UI.** The schema supports multiple vehicles per rider; the trip-logging form doesn't yet expose vehicle selection.
- **No admin dashboard yet.** The `role` field and access-control plumbing exist, but there's no UI surfacing aggregated, anonymized platform-wide stats.
- **No community/crowd-sourced layer.** Deliberately deferred — see §2 and the original project brief for why this is scoped as a stretch feature, not core.
- **Coarse time-slot buckets.** 10 slots per platform (5 time-of-day × 2 day-type) trade granularity for statistical reliability with modest data volumes. With more data, finer-grained slots (e.g., actual hour ranges) would become viable.

---

## 11. Possible Next Steps

- Real rider interviews to recalibrate synthetic data assumptions
- Admin aggregate-stats view
- Multi-vehicle support in the UI
- Goal-setting & forecasting feature (rider sets an earnings target, system suggests which platforms/hours to prioritize)
- Opt-in anonymized community signal layer, carefully scoped to avoid any platform-ToS or legal risk
