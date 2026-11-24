# UVelocity HTTP API and persistence contract

All routes below are relative to `/api`. The API stores accounts, sessions, ownership, credit balances, race results and published tuning in PostgreSQL. `Rp` denotes **virtual game credits** (`RP_GAME`), with no payment gateway, cash withdrawal or cash redemption in this implementation.

## Authentication and request conventions

- JSON request bodies use `Content-Type: application/json`. The admin media and vehicle-photo upload routes described below accept bounded raw file bytes instead, while retaining the same Origin, cookie, CSRF, role, and prayer checks.
- Every state-changing HTTP request must include an `Origin` exactly matching a configured application origin. Missing origins, foreign origins and `Sec-Fetch-Site: cross-site` are rejected.
- Login and registration do not require an existing session. Every other authenticated mutation also requires `X-CSRF-Token`, obtained from login, registration or `GET /auth/me`.
- Authentication uses an opaque `uv_session` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/` and an absolute seven-day expiry. `Secure` is enabled by default when `NODE_ENV=production`; the main server can explicitly configure it. Session tokens are hashed before storage. Never put them into browser local storage or URLs.
- Race admission uses a separate short-lived one-time ticket, described below.
- All balances, prices, rewards and ledger amounts are **decimal strings**, for example `"25000"`. Wallet and loadout versions are also strings. Catalog versions are numbers; ruleset versions are strings.
- Money calculations use integer PostgreSQL `BIGINT` and Node.js `BigInt`. The wallet limit is `1000000000000000` credits. A manual top-up or catalog price cannot exceed `1000000000000` credits.
- API responses use `Cache-Control: no-store`, except immutable public media bytes at `/media/:id` and `/vehicle-thumbnails/:id`.
- Errors have this shape:

```json
{"error":{"code":"INSUFFICIENT_BALANCE","message":"Kredit game tidak mencukupi."}}
```

Typical statuses are `400` for invalid input, `401` for missing/invalid authentication, `403` for ownership/CSRF/origin/role failures, `404` for missing resources, `409` for version or idempotency conflicts, `413` for an oversized upload, `415` for an unsupported request format, `416` for an unsatisfiable media byte range, `423` for an active personal prayer break, and `429` for throttling.

### Idempotency

`POST /shop/purchase`, `POST /garage/appearance/apply` and `POST /admin/topups` require an `Idempotency-Key` header containing 8–128 characters. Generate the key once for the user action and reuse it on timeout/retry. The same key with the same payload returns the previously committed response; the same key with a different payload returns `IDEMPOTENCY_CONFLICT`.

A replay returns the original wallet snapshot for that operation. Refresh `/profile`, or compare `wallet.version`, before replacing a newer balance displayed in another tab. The application must not infer balances from client arithmetic.

## Accounts and profile

### `POST /auth/register`

Body:

```json
{"email":"racer@example.com","displayName":"Racer","password":"a-user-chosen-long-password"}
```

Email is normalized to lower case. Display names contain 2–32 characters. Passwords contain 12–128 characters. Successful registration returns HTTP `201`, sets the session cookie and returns `{user, csrfToken}`. The submitted role, money or inventory cannot grant privileges or credits.

An account receives BRZ, stock wheels and **25,000 virtual credits** in the same transaction as account creation. This starter grant occurs once per account. There is no import of client-side money, unlocks or offline records.

### `POST /auth/login`

Body: `{email, password}`. Returns `{user, csrfToken}` and a newly generated session cookie. The current browser session is replaced after successful login. Wrong credentials return `INVALID_CREDENTIALS` without distinguishing an unknown email.

### `GET /auth/me`

Authenticated response:

```json
{
  "user": {
    "id": "user UUID",
    "email": "racer@example.com",
    "displayName": "Racer",
    "avatarId": "driver-1",
    "role": "player",
    "createdAt": "ISO-8601 timestamp"
  },
  "csrfToken": "session synchronizer token"
}
```

Unauthenticated response is HTTP `200` with `{"user":null,"csrfToken":null}`.

### `POST /auth/logout`

Authenticated, with CSRF. Send `{}` as the JSON body. Deletes the session and its outstanding race tickets, clears the cookie and returns `{"ok":true}`.

### `GET /profile`

Authenticated response:

```json
{
  "user": {
    "id": "user UUID",
    "email": "racer@example.com",
    "displayName": "Racer",
    "avatarId": "driver-1",
    "role": "player",
    "createdAt": "ISO-8601 timestamp"
  },
  "wallet": {"balance":"25000","version":"1","currency":"RP_GAME"},
  "inventory": {"cars":["brz"],"wheels":["stock"]},
  "loadout": {
    "carId":"brz","rimId":"stock","wheelId":"stock",
    "color":"#2866b8","rimColor":"#c7cdd4","stockRimPainted":false,"finish":"metallic",
    "stripeId":"none","stripeColor":"#ffffff","version":"1","appearanceVersion":"1"
  },
  "statistics": {"races":0,"wins":0,"rewards":"0"}
}
```

`accessibleCars` also lists every car currently usable, including temporary admin-open cars. `appearances` contains `{carId,rimId,color,finish,rimColor,stockRimPainted,stripeId,stripeColor,version,owned,canCustomize}` per accessible car. Permanent cars keep their saved appearance. Temporary cars use factory appearance with `owned:false`, `canCustomize:false`, `stockRimPainted:false`, and version `"0"`. If the active temporary car has been relocked, reading the profile repairs the active choice to a permanently owned car without changing any running race.

`statistics.races` counts stored human race results, including DNF. Wins require a finished result in position 1. Rewards are the total credits awarded by race settlement.

### `PATCH /profile`

Authenticated, with CSRF. Body: `{displayName?, avatarId?}`; at least one must be present. The avatar presets are `driver-1` through `driver-6`. Arbitrary avatar URLs are not accepted. Returns `{user}`.

## Catalog, purchases and workshop

### `GET /catalog`

Public response:

```json
{
  "currency":"RP_GAME",
  "currencyLabel":"Rp · kredit game",
  "rulesetVersion":"1",
  "tuningBounds": {
    "topSpeed":{"min":120,"max":450},
    "zeroTo100":{"min":1.8,"max":15},
    "handling":{"min":0.6,"max":1.6}
  },
  "categories": [{"id":"sport","name":"Sport","sortOrder":10,"version":1}],
  "cars": [],
  "wheels": [],
  "services": [],
  "stripes": []
}
```

Each car has `id`, `itemId` (same as `id`), `kind:"car"`, `name`, `price`, `catalogVersion`, `enabled`, `locked`, `color`, `drive`, `stats:{topSpeed,zeroTo100,handling}`, the same three stats at the top level for UI compatibility, `tuningVersion`, `categoryId:string|null`, and `thumbnail:VehicleThumbnail|null` as described under vehicle collection photos. The starter car also has `starter:true`.

Since **1.6.0**, each server car response also includes the validated factory `finish`: `"metallic"`, `"gloss"`, or `"matte"`. The client contract declares `CatalogItem.finish?: Finish` for compatibility with older responses. Absent or invalid finish metadata resolves to `"metallic"`, preserving the default for the previous twenty vehicles. Tumbler starts matte; KITT starts gloss. The showroom uses this value when the account has no saved appearance for the selected car. A permanently owned car's saved appearance takes priority. The same factory finish is used for a new purchase and temporary admin-unlocked access; neither reading the catalog nor previewing a car repaints an existing purchase.

Since 1.4.0, `categories` is an ordered array of `VehicleCategory` objects, defined in `shared/vehicle-categories.ts` as `{id:string,name:string,sortOrder:number,version:number}`. The server orders by `sortOrder`, case-insensitive name, then ID. `categoryId:null` means the car is unassigned. The response still contains the complete catalog; the showroom filters this list locally by all cars, a category ID, or unassigned cars. Category changes do not equip a vehicle or create a purchase. The collection renders at most four cards per page; changing pages only changes the visible card group.

Each wheel has `id`, `itemId`, `kind:"wheel"`, `name`, `price`, `catalogVersion`, `enabled`, `color`, `cosmeticOnly:true`, and optional `spokes`/`starter`. Wheel selection and wheel color do not modify vehicle stats.

`locked` controls free use independently of `enabled` (sale availability). Permanent ownership always grants use, even when locked or not for sale. `services` contains paid paint and stripe services; `stripes` is the five install-service subset. The fourteen reference-based models also expose `modelOrigin` and `modelNote`.

Disabled offers remain in the catalog with `enabled:false` so existing owners can still render and use their assets. Purchases of disabled offers fail.

Initial catalog:

| ID | Item | Initial price |
|---|---|---:|
| `brz` | Subaru BRZ | 0; starter |
| `kaze` | Kaze Rally | 180000 |
| `apex` | Apex GT | 220000 |
| `cinder` | Cinder V8 | 350000 |
| `skyline` | Nissan Skyline GT-R R34 | 650000 |
| `veloce` | Veloce R | 900000 |
| `aventador` | Lamborghini Aventador | 1400000 |
| `veyron77` | Bugatti Veyron Polisi 77 | 1800000 |
| `bmw-hybrid-v8` | BMW M Hybrid V8 | 1650000 |
| `bmw-m4-gt4` | BMW M4 GT4 (F82) | 620000 |
| `amg-gt4` | Mercedes-AMG GT4 | 780000 |
| `sls-amg-gt3` | Mercedes-Benz SLS AMG GT3 | 1050000 |
| `batmobile-1989` | Batmobile 1989 | 1300000 |
| `jesko-absolut` | Koenigsegg Regera | 2400000 |
| `venom-f5` | Hennessey Venom F5 | 2200000 |
| `panther-grand-touring` | Isuzu Panther Grand Touring | 150000 |
| `honda-crv-rs` | Honda CR-V RS e:HEV | 280000 |
| `mitsubishi-pajero-sport` | Mitsubishi Pajero Sport | 320000 |
| `toyota-fortuner` | Toyota Fortuner GR Sport | 340000 |
| `toyota-innova-zenix` | Toyota Kijang Innova Zenix Hybrid | 345000 |
| `batmobile-tumbler` | Batmobile Tumbler · The Dark Knight | 1500000 |
| `knight-rider-kitt` | Pontiac Knight Rider 1983 · KITT | 850000 |
| `stock` | Roda bawaan | 0; starter |
| `six-spoke` | Six Spoke | 20000 |
| `multi-spoke` | Multi Spoke | 35000 |
| `mesh` | Mesh Gold | 50000 |

Prices and tuning are game design values, not market prices or manufacturer performance specifications. The catalogue contains **22 cars in 1.6.0**; a race still allows at most 15 participants (14 bots). The historical `jesko-absolut` key is retained for the Regera reference update, preserving purchases, photos, appearances and race history. Migration 012 changes only the original default label; operator-custom labels survive. Panther is added by migration 013 with a new ruleset that copies existing published vehicle tuning, physics and reward policy.

Migration **014_vehicle_categories.sql** adds separate category and assignment tables, without changing the existing offer rows or their versions. The editable category map, including the additive 1.5.0 and 1.6.0 groups, is:

| Category ID | Initial name | Assigned cars |
| --- | --- | --- |
| `sport` | Sport | `brz`, `skyline`, `apex` |
| `supercar` | Supercar | `aventador`, `veloce` |
| `hypercar` | Hypercar | `jesko-absolut`, `venom-f5` |
| `race` | Mobil balap | `bmw-hybrid-v8`, `bmw-m4-gt4`, `amg-gt4`, `sls-amg-gt3` |
| `rally` | Reli | `kaze` |
| `muscle` | Muscle | `cinder` |
| `mpv` | MPV | `panther-grand-touring`, `toyota-innova-zenix` (1.5.0) |
| `suv` | SUV (1.5.0) | `honda-crv-rs`, `mitsubishi-pajero-sport`, `toyota-fortuner` |
| `special` | Spesial | `veyron77`, `batmobile-1989` |
| `koleksi-ikonik` | Koleksi Ikonik (1.6.0) | `batmobile-tumbler`, `knight-rider-kitt` |

Migration **015_suv_catalog.sql** adds the four purchasable family vehicles, thumbnail slots, SUV/MPV assignments, and a new immutable ruleset copied from the previous active publication. Existing prices, ownership, appearances, category edits, physics and rewards are retained. An existing category named SUV is reused; a conflicting custom slug is not renamed. These initial prices put CR-V, Pajero, Fortuner and Zenix together in that order under the existing price sort. Operator price edits can change their order.

Migration **016_iconic_collectors.sql** adds Tumbler and KITT as two distinct purchasable reference recreations, their thumbnail slots, and the **Koleksi Ikonik** category. Initial prices are **Rp1.500.000** and **Rp850.000** in virtual game credits; administrators can edit them through the existing versioned offers. A same-name operator category is reused regardless of its ID; a conflicting `koleksi-ikonik` slug receives a free numbered suffix without renaming the existing group. Only the two new cars are assigned, so `batmobile-1989` remains in its previous category. The category is available to showroom filtering and the existing frozen vehicle-category room rules.

The new immutable ruleset copies all twenty previous cars, physics and rewards from the active publication before appending the two new arcade profiles. The purchase trigger reads each new car's validated factory finish without resetting previously saved appearances. Defaults are `#202329` / matte / AWD for Tumbler and `#10141a` / gloss / RWD for KITT. These are original, stylized game reconstructions based on the supplied photographs, not studio meshes, scans, factory CAD, or claims of exact film performance. The bundled Blender inspection views are documented in `docs/previews/README.md`.

### `POST /shop/purchase`

Authenticated, with CSRF and `Idempotency-Key`.

Body: `{"itemId":"six-spoke","catalogVersion":1}`.

Response: `{purchaseId, itemId, pricePaid, wallet:{balance,version,currency}}`.

The server loads the price, holds the offer stable, locks the wallet, checks existing ownership and commits debit, ledger, purchase and ownership together. Two concurrent requests cannot overspend one wallet. Owned items cannot be purchased twice. A stale offer version returns `CATALOG_CHANGED` without a debit.

### `PUT /loadout`

Authenticated, with CSRF. Free selection of a saved vehicle/owned wheel:

```json
{"carId":"brz","rimId":"six-spoke"}
```

`wheelId` is an accepted alias for `rimId`; if both are supplied they must agree. An omitted wheel retains the selected vehicle's saved rim. The car must be permanently owned or globally unlocked; the wheel must be owned. Every cosmetic field supplied through this endpoint must equal the server-saved appearance, otherwise the request fails with `PAID_CUSTOMIZATION_REQUIRED`. Optional `appearanceVersion`/`expectedAppearanceVersion` must match if supplied. This endpoint cannot apply unpaid paint or striping.

Returns `{loadout:{carId,rimId,wheelId,color,rimColor,stockRimPainted,finish,stripeId,stripeColor,version,appearanceVersion}}`. Switching between saved cars does not debit credits. Changing an owned rim selection updates that vehicle's saved appearance. Temporary admin-open vehicles use factory cosmetics and an owned wheel; they cannot purchase custom appearance until permanently acquired. The paid stock-rim override is also checked by this endpoint and the realtime admission/loadout path; sending a boolean does not grant free paint.

### `POST /garage/appearance/quote`

Authenticated, with CSRF. Body contains `carId` and any desired `rimId`, `color`, `finish`, `rimColor`, `stockRimPainted`, `stripeId`, or `stripeColor`. Colors are normalized `#RRGGBB`. Finish is `metallic`, `gloss`, or `matte`. Stripe IDs are `none`, `twin-racing`, `offset`, `side-sweep`, `circuit`, and `heritage`. Both owned stock and custom rims support paid color changes. Paid customization requires permanent car ownership.

`stockRimPainted` is an explicit boolean indicating whether the original stock wheel uses the saved color override. Migration initializes legacy appearances to false, and the renderer treats a missing legacy wire flag as false, preserving the actual original wheel material regardless of the old placeholder `rimColor`. Explicit first repaint sets this flag true and charges the rim-paint service even when choosing `#c7cdd4`. The flag and RGB value are saved per car and frozen with its race loadout. Changing a wheel package alone cannot change this paid flag without a workshop quote. Custom packages continue to use `rimColor`.

Quote normalization differs from legacy initialization: when selecting stock rims, an omitted flag preserves the saved state, unless a changed `rimColor` infers an explicit repaint. Explicit `false` requests factory restoration and retains the previously saved RGB; toggling the saved state incurs `paint-rims`. When selecting a custom rim, the saved stock-paint flag is preserved even if the request supplies a different boolean. Its visible custom rim RGB can still change through the paid quote path. Selecting no stripe similarly retains the stored, currently hidden stripe color.

Returns `{quoteId,carId,appearanceVersion,selection,currentAppearance,lineItems,total,wallet,affordable,noOp,expiresAt}`. Each line item contains `{itemId,name,price,catalogVersion}`. The server stores this offer for **10 minutes**; creating it does not debit credits or change appearance. `total` and line prices are decimal strings. A quote can be returned even when the wallet is currently insufficient so the UI can show the exact cost.

Initial services: `paint-body` 10000, `paint-rims` 5000, `stripe-paint` 5000, `stripe-twin-racing` 15000, `stripe-offset` 18000, `stripe-side-sweep` 12000, `stripe-circuit` 20000, `stripe-heritage` 22000, `stripe-remove` 5000. Body color and finish changed together form one paint charge. Changing only the color of an existing design uses `stripe-paint`; installing/replacing a design includes the chosen color in that design's installation price, without an additional recolor charge. Every fee and availability flag comes from the versioned admin service catalog, never a client-supplied amount. Identical saved appearance incurs no cosmetic charge.

Migration **011** adds the stock-paint state and stripe recolor service without overriding existing admin service prices. It expires unapplied pre-migration quotes so they cannot apply under the old pricing contract. Successfully committed applications and idempotent responses remain replayable without a second charge.

### `POST /garage/appearance/apply`

Authenticated, with CSRF and a stable `Idempotency-Key`. Body: `{"quoteId":"quote UUID"}`.

Returns `{applicationId,appearance,loadout,wallet,pricePaid,lineItems,noOp}`. The transaction locks the quote, relevant offers, wallet, and appearance, verifies ownership/expiry/price versions/appearance version, then writes the debit, saved appearance, active loadout, application record, and ledger together. The ledger kind is `customization`. Retrying the same key and quote returns the saved result. Reusing an already-applied quote with another key also cannot debit twice.

`QUOTE_EXPIRED`, `CATALOG_CHANGED`, `APPEARANCE_CHANGED`, `SERVICE_UNAVAILABLE`, `CAR_NOT_OWNED`, and insufficient funds require the UI to obtain a valid new quote or resolve the issue; partial changes do not commit. Removing an existing stripe is paid; selecting `none` when no stripe exists is free. Applying a no-op quote does not debit the wallet.

### `GET /wallet/transactions?limit=30`

Authenticated. `limit` must be an integer from 1 to 100. Response:

```json
{"entries":[{"id":"ledger UUID","delta":"25000","balanceAfter":"25000","walletVersion":"1","kind":"starter","reason":"Kredit awal virtual UVelocity","createdAt":"ISO-8601 timestamp"}]}
```

Entries are returned newest first. Purchases have negative deltas. Wallet ledger rows are append-only in the database.

## Race admission and settlement

### `POST /race/ticket`

Authenticated, with CSRF; body `{}`. Returns `{ticket, expiresAt}`. The opaque ticket expires after **60 seconds**, is usable **once**, and is bound to the same HttpOnly session. Send it as the realtime join payload, never in a URL. A newly issued ticket is required for a fresh join attempt after one has been consumed.

### `GET /rooms/:code`

Authenticated, throttled invite preflight. Returns `{roomId,inviteCode,phase,config,humans,joinable,vehicleRestriction}`. `vehicleRestriction` is the same frozen rule exposed on room snapshots; the client can choose an eligible saved vehicle before consuming a join ticket. Preflight is informational: a room may fill or start before the subsequent join, and realtime admission still checks everything.

### Room configuration and vehicle eligibility (1.5.0)

```ts
interface RoomConfig {
  circuit: 'city' | 'beach' | 'glacier' | 'drag-2km';
  laps: number; // 1–20 for circuits; canonicalized to 1 for drag
  bots: number; // 0–14
  maxHumans: number; // 1–15; humans + bots <= 15
  difficulty: 'easy' | 'normal' | 'hard';
  collisionMode: 'solid' | 'ghost';
  vehicleCategoryId?: string | null; // null/omitted = all vehicles
}
interface VehicleRestriction {
  categoryId: string | null;
  categoryName: string | null;
  allowedCarIds: readonly CarId[];
}
```

Room creation resolves a current admin-managed category to one name and ordered vehicle list, freezes both, and rejects missing/empty categories. This rule applies to humans and bots on admission, loadout change, readiness, start, and reconnect. Renaming/deleting a category or moving its cars later does not rewrite an existing room. Permanent ownership and currently unlocked access are still checked separately; disabling a sale does not bar an existing owner. The UI uses the frozen list for existing rooms, rather than recomputing it from live category assignments. Selecting a car for the room uses its saved appearance and does not purchase cosmetics or equip it in the garage.

`VEHICLE_CATEGORY_NOT_FOUND`, `VEHICLE_CATEGORY_EMPTY`, and `VEHICLE_CATEGORY_RESTRICTED` describe missing categories, empty categories, and a disallowed vehicle. Rejecting a visitor does not abort the room, reserve a reconnect seat, or cancel another member's pending start. Allowed bot IDs feed both authoritative bot creation and client asset preloading. `beginRace` persists the frozen rule and verifies that participant IDs and frozen loadouts agree with it.

### Open drag track (1.5.0)

`drag-2km` has a 2,000-metre open centerline from `(0,0)` to `(0,-2000)`, with 480 samples including both endpoints. The 45-metre strip supports up to 15 lanes at 3-metre spacing; all grid positions are 8.5 metres before the timing line. The score covers one forward journey through ordered progress gates; staging and the 700-metre braking runout are outside the measured start/finish separation. The race clock begins with the shared countdown release, including the equal staging approach. No local finish time or client reward is trusted.

Open projection, reset, finish progress, minimap, and post-finish rollout never wrap to the start. Drag resets preserve longitudinal distance. Circuit behavior remains closed and supports 1–20 laps. `trackVersion` is now `nv-courses-2`. All-human completion, server settlement and shared prayer pauses retain their prior behavior.

### Server-only service boundary

These methods are not exposed as public HTTP mutation endpoints:

```ts
services.accounts.consumeRaceTicket({ticket, headers});
services.economy.getActiveRuleset();
services.economy.resolveLoadout(userId, selection?, rulesetVersion?);
services.economy.beginRace(beginRaceInput);
services.economy.finalizeRace(raceResult);
services.economy.abortRace(raceId, reason?);
```

Contracts for race inputs/results are defined in `shared/types.ts`. `resolveLoadout` checks permanent or temporary access and saved cosmetics, returning a frozen choice containing `carId`, `rimId`, `color`, `rimColor`, `finish`, `stripeId`, `stripeColor`, `appearanceVersion`, `stats`, `tuningVersion`, and `partVersion`. Omitted appearance fields use saved values; supplied unpaid values are rejected. A specified ruleset version loads that immutable version instead of the currently active one.

The room obtains one ruleset for everyone before countdown. `beginRace` persists the configuration, participant identities and frozen loadouts, including bots. Settlement rejects a different participant/configuration snapshot, writes results and wallet entries atomically, and is idempotent by race ID. Repeating the same final result returns the saved settlement; changing an already-finalized result returns `RESULT_CONFLICT`.

The client cannot supply a reward amount or settle a race through an HTTP endpoint. The authoritative room simulation supplies checkpoint/lap/finish outcomes. Reward calculation uses the ruleset saved for that race, even if an admin has published a new one.

Race completion is driven by the human roster: once every non-bot racer is finished or DNF, the runtime ends immediately and marks remaining unfinished bots DNF. Previously finished bots retain their finish times and ranks. A temporarily disconnected human remains a participant until the existing reconnect grace ends or that participant leaves; finished/DNF humans do not block completion. Existing maximum-duration and late-finisher deadlines remain in force. The room transitions to settlement exactly once and persists the final result before reporting rewards.

Finishing preserves the crossing speed and interpolated crossing time. Throttle, brake, steering, reset, and nitro inputs from that racer are no longer accepted. While others still race, a shared server-side coasting step reduces speed monotonically and follows the course as a ghost, without changing scored progress, lap counts, distance, or finish/lap times. Finished cars cannot collide with racers still competing. After the last official simulation tick, the renderer may complete a cosmetic rollout beneath the result overlay; this does not send new movement, postpone settlement, or alter positions in the result. Prayer pauses also freeze coasting.

Initial reward policy is 10000 credits for a valid finish, plus 1000 per completed lap, plus podium bonuses of 15000/8000/4000 for positions 1/2/3, capped at 50000. A finish must take at least 15000 simulation milliseconds. DNF earns zero. Bots receive no wallet entries. Fixed-tick simulation time may trail wall time under server load without blocking settlement.

`abortInterruptedRaces()` is available for a **single-server startup** before accepting rooms. It marks unfinished persisted races aborted without a payout. Do not call it on each worker in a multi-server deployment.

## Arena and shared prayer protocol

The loading barrier is separate from lobby readiness. After all players are ready and the host requests start, the server broadcasts `phase:"loading"`, a unique `startToken`, and `loadingDeadline`. Every client must load the actual models, build/apply the grid, and observe a visible rendered arena frame before sending `arena_ready {raceId,startToken}`. `members[].arenaReady` exposes the current barrier. Loading failure sends `arena_failed {raceId,startToken,reason}`. Timeout after 45 seconds, unready, disconnect, or cancellation returns the room to lobby and invalidates old acknowledgments. Only the completed barrier may persist/start a race and broadcast one common countdown deadline.

The administrator-selected JPEG is a presentation overlay on this barrier. The actual game iframe stays mounted and rendering beneath it; neither loading a JPEG nor reaching 100% file-download progress is an arena acknowledgment. A missing/failed JPEG uses the default background and does not stall readiness. Prayer overlays take priority. The loading overlay ends only when the server leaves the loading phase for the common countdown, cancellation, failure, or prayer handling.

Prayer schedule status is checked server-side for every room member. A triggering member freezes the entire room, including bots, using `phase:"prayer_pause"`. `snapshot.prayerPause` is:

```ts
{
  pauseToken: string;
  startedAt: number;          // epoch milliseconds
  resumeEligibleAt: number;   // max(prayer end, latest detection + 15 minutes)
  resumeAt: number | null;    // shared 3-second countdown deadline
  previousPhase: 'lobby' | 'loading' | 'countdown' | 'racing';
  triggers: Array<{eventId:string;userId:string;displayName:string;
    prayer:'fajr'|'dhuhr'|'asr'|'maghrib'|'isha';name:string;
    startedAt:number;resumesAt:number}>;
  requiredIds: string[];      // session/racer IDs
  readyIds: string[];
}
```

No private location coordinates enter this payload. After the minimum window, each required human sends `resume_ready {pauseToken}`. The server rejects early/stale/repeated consent. All participants must still be eligible and connected before the room changes to `resume_countdown`. After the common deadline, the prior race resumes. A newly detected prayer event holds the room for at least 15 actual minutes from detection (never earlier than its scheduled end), extends the existing deadline if needed, rotates the token, and clears consent. A dropped connection resets that participant's consent; explicit leave or expired reconnect removes them from the required list. No prayer-specific kick, logout, or reconnect-token deletion occurs.

Simulation ticks, elapsed race/lap time, physics, bot movement and buffered player controls are held or cleared while paused. A pause during loading safely cancels that start attempt and returns to the lobby only after consent; it cannot bypass the normal arena barrier. A per-player UI clock is informational and never authorizes resume.

## Personal prayer locations and schedules

### `GET /prayer/locations`

Public. Returns `{locations:[{id,name,province,latitude,longitude,timezone}]}` for 44 manual Indonesian city choices. Zone names are re-derived server-side when a location is saved.

### `GET /prayer/status`

Optional authentication. An authenticated account receives its own saved location and latched active window; unauthenticated requests use Jakarta. Full types are in `shared/prayer.ts`:

```ts
{
  enabled: true; allowed: boolean; paused: boolean;
  serverNow: string; localDate: string; pauseEndsAt: string | null;
  currentPrayer: PrayerWindow | null; nextPrayer: PrayerWindow;
  dailyTimes: PrayerWindow[];
  location: {mode:'gps'|'manual'|'fallback';cityId:string|null;label:string;
    latitude:number;longitude:number;timezone:string;fallbackReason:string|null};
  calculation: {method:'location-20-18-v1';label:string;fajrAngle:20;ishaAngle:18;
    adjustmentMinutes:2;rounding:'up';madhab:'Shafi';official:false};
  message: string;
}
```

`PrayerWindow` is `{eventId,prayer,name,startedAt,resumesAt}`; its timestamps and `serverNow`/`pauseEndsAt` are ISO strings. This differs from realtime snapshots, whose timestamps are numeric milliseconds. Exactly five prayers are included; sunrise is not a sixth break. The event ID is stable for the prayer name and scheduled instant.

### `PUT /prayer/location`

Authenticated with CSRF. Accept one of:

```json
{"mode":"gps","latitude":-6.21,"longitude":106.85}
{"mode":"manual","cityId":"jayapura"}
{"mode":"manual","latitude":-8.65,"longitude":115.22}
{"mode":"fallback"}
```

Returns `PrayerStatus`. GPS/manual coordinates must be finite, in [-90,90]/[-180,180], and are rounded to two decimal places. Extra fields (including timezone, server clock, or a client-selected pause end) are rejected. Jakarta fallback is (-6.2088,106.8456), Asia/Jakarta. Valid polar coordinates with no complete calculable schedule explicitly fall back to Jakarta with a reason. Changing location first captures the old location's current window, then retains the longest active end; changing location/relogging/restarting the process cannot shorten an already-active personal break.

During a personal break, shop purchase, appearance quote/apply, loadout changes, new race tickets, and admin mutations return HTTP423:

```json
{"error":{"code":"PRAYER_BREAK","message":"Waktu salat. ...","status":{"paused":true,"...":"full PrayerStatus"}}}
```

Login/logout, profile reads/updates, current schedule, and location correction remain available. Existing room participants are governed by the shared pause protocol and may reconnect during it. Local Adhan calculation requires no external API/key; it does not claim to be an official live Kemenag timetable. See [PRAYER.md](PRAYER.md) for calculation settings, consent rules, privacy and deployment details.

## Administrator endpoints

All administrator routes require a current authenticated admin role. Mutations also require CSRF and exact Origin checks. Creating an admin account is an explicit operator CLI action; there are no seeded administrator credentials.

### `GET /admin/users?q=&limit=30`

Searches email, display name or exact UUID. `limit` is 1–100. Response:

```json
{"users":[{"id":"user UUID","userId":"user UUID","email":"racer@example.com","displayName":"Racer","avatarId":"driver-1","role":"player","status":"active","balance":"25000","walletVersion":"1","createdAt":"ISO-8601 timestamp"}]}
```

Status is `active` or `disabled`. This route does not expose passwords or session tokens.

### `POST /admin/topups`

Requires `Idempotency-Key`. Body:

```json
{"userId":"target user UUID","amount":"50000","reference":"operator-grant-unique-reference","reason":"Manual virtual credit grant"}
```

`amount` is a positive decimal string, `reference` contains 8–100 characters and `reason` contains 4–500 characters. The grant reference is globally unique across admins and request keys. Repeating the same reference/payload does not credit twice; a different grant reusing the reference fails.

Response: `{entryId,userId,amount,reference,alreadyApplied,wallet:{balance,version,currency}}`.

This adds virtual credits. It does not record or verify a real payment. The wallet and audit entry commit together. No endpoint directly overwrites a balance or deletes ledger history.

### `PATCH /admin/catalog/:itemId`

Body: `{price?:string, enabled?:boolean, locked?:boolean, categoryId?:string|null, expectedVersion:number, reason:string}`. Supply at least one of the optional fields. `locked` and `categoryId` are accepted only for cars. `locked:false` allows temporary free use but never grants inventory; `locked:true` revokes free use for players without permanent ownership. Paid owners remain entitled, and a running race retains its frozen loadout. Service items can change price/availability through the same route. Prices may be zero. A stale version returns `409 CATALOG_CHANGED`.

For category assignment, send the existing category ID or real JSON `null` to remove the assignment. Omitting `categoryId` preserves it. A category-only request does not change price, availability, global lock, ownership, appearances, or tuning. The destination category is locked against deletion until the assignment transaction finishes. An unknown category returns `404 CATEGORY_NOT_FOUND`; assigning a wheel/service returns `400 INVALID_CATEGORY`.

Response: `{item:{id,kind,name,price,enabled,locked,catalogVersion,categoryId?}}`; `categoryId` is present when the request changes the assignment. Each accepted update increments the offer version and writes a `catalog.updated` audit event, including the previous/new category when applicable. Example:

```json
{"categoryId":"mpv","expectedVersion":3,"reason":"Group this family vehicle under MPV"}
```

### `GET /admin/vehicle-categories`

Authenticated admin read. Returns `{categories:VehicleCategory[]}` with the same sorted category metadata as the public catalog. This endpoint does not contain player ownership or account information.

### `POST /admin/vehicle-categories`

Authenticated admin mutation with JSON, CSRF, exact Origin, and prayer checks. Body: `{name:string,sortOrder?:number,reason:string}`. The name is normalized to NFC, trimmed, and repeated ordinary spaces are collapsed; it must contain 2–40 characters without control characters. Names are unique case-insensitively. `sortOrder` is an integer from 0 through 9999 and defaults to 0. `reason` contains 4–500 characters.

HTTP `201` returns `{category:{id,name,sortOrder,version:1}}`. The server creates a new UUID ID and records `vehicle.category.created` in the same transaction. A duplicate name returns `409 CATEGORY_NAME_TAKEN`. Creating a category does not add a vehicle or its 3D asset.

### `PATCH /admin/vehicle-categories/:categoryId`

Body: `{name:string,sortOrder:number,expectedVersion:number,reason:string}`. Authentication, CSRF, Origin, prayer checks, and field validation are the same as creation. Supply both the name and the order. `expectedVersion` must be a positive integer; the existing admin version parser also accepts a valid positive decimal string.

The transaction locks the category, checks its current version, updates name/order, increments the version, and writes `vehicle.category.updated`. Returns `{category:VehicleCategory}`. The ID and existing vehicle assignments remain unchanged. A stale edit returns `409 CATEGORY_CHANGED`; an unknown ID returns `404 CATEGORY_NOT_FOUND`. Reload and review before submitting again; the UI does not silently retry the edit with a new version.

### `DELETE /admin/vehicle-categories/:categoryId`

Body: `{expectedVersion:number,reason:string}`, with the same admin mutation checks. Deletion is allowed only when no vehicle is assigned. A category still in use returns `409 CATEGORY_IN_USE`; a stale version returns `409 CATEGORY_CHANGED`; an unknown ID returns `404 CATEGORY_NOT_FOUND`.

Success returns `{deleted:true,id:string}` and writes `vehicle.category.deleted` in the same transaction. The UI asks for confirmation and an audit reason. Move vehicles to another category or remove their assignment before deleting a used category. No vehicle, purchase, loadout, wallet, photo, or race record is deleted.

### `GET /admin/tuning`

Returns `{version,bounds,physics,rewardPolicy,cars:[{carId,topSpeed,zeroTo100,handling}]}` for the active ruleset. All tuning values are numeric.

### `POST /admin/tuning/publish`

Body:

```json
{"expectedVersion":"1","carId":"brz","topSpeed":255,"zeroTo100":5.6,"handling":1.18,"reason":"Describe the balancing change"}
```

Bounds: `topSpeed` 120–450 km/h; `zeroTo100` 1.8–15 seconds; `handling` 0.6–1.6. Top speed and acceleration time are rounded to two decimal places, handling to three. These are arcade simulation settings.

Publishes an immutable ruleset containing all sixteen cars. Unchanged cars are copied forward. `expectedVersion` accepts a positive integer or its decimal string. A stale version returns `RULESET_CHANGED`. Response: `{version,previousVersion,appliesTo:"new-races",car,rewardPolicy}`.

### `POST /admin/rewards/publish`

Body:

```json
{
  "expectedVersion":"1",
  "reason":"Describe the reward policy change",
  "rewardPolicy":{
    "finish":"10000","perLap":"1000","podium":["15000","8000","4000"],
    "minimumDurationMs":15000,"maximum":"50000"
  }
}
```

Limits: finish and each podium bonus 0–100000; per-lap amount 0–10000; cap 0–500000; minimum duration 15000–300000 milliseconds. Credit fields are decimal strings. This publishes a new immutable ruleset through the same version check. Running races retain their previous policy. The returned shape matches tuning publication, with `car:null` for a reward-only change.

### `GET /admin/audit?limit=50`

`limit` is 1–100. Returns `{entries:[{id,actorId,actorName,action,targetId,reason,before,after,createdAt}]}`. Events include `admin.created`, `wallet.topup`, `catalog.updated`, `ruleset.published`, `media.uploaded`, `media.deleted`, `presentation.updated`, `vehicle.thumbnail.updated`, `vehicle.thumbnail.deleted`, `vehicle.category.created`, `vehicle.category.updated`, and `vehicle.category.deleted`. Audit rows are append-only.

## Garage music, opening splash, and loading artwork

Types are declared in `shared/media.ts`. Migration **009** adds `presentation_assets` and a singleton `presentation_settings` row. Upload bytes are PostgreSQL `bytea`, so the existing database volume and backup contain the actual media as well as metadata. No app-container upload directory is needed. Initial selections are `null`; there is no seeded song or mandatory loading picture.

### `GET /presentation`

Public, uncached response:

```ts
interface PresentationSettings {
  version: number;
  garageMusic: MediaAsset | null;
  loadingImage: MediaAsset | null;
  musicVolume: number; // 0..1; initial value 0.35
}

interface MediaAsset {
  id: string; // UUID
  kind: 'garage_music' | 'loading_image';
  name: string;
  url: string; // same-origin /api/media/<UUID>
  mimeType: 'audio/mpeg' | 'image/jpeg';
  bytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  createdAt: string; // ISO timestamp
}
```

Only presentation metadata is public; uploader/account identifiers are not returned. Since 1.3.1 the client requests this configuration at application startup, before authentication completes, so the selected MP3 can start during the splash. Configuration and a single persistent audio element survive splash, login, account-loading, and garage transitions. A refresh with the same selected asset must not replace the source or reset playback position. Configuration continues to refresh outside an active race.

Since 1.4.0, `loadingImage` is also the background of the single opening splash. The UI retains the UIKA and Teknik Informatika logos and `create by civitas UIKA` credit above the image. A fixed three-second timer starts when the splash mounts; late configuration/image loading does not restart it, and a missing or failed image uses the default background. The splash then reveals the existing authenticated garage/account-loading state or login screen. This timer is unrelated to the server's arena-readiness barrier. The same selected JPEG continues to serve as the race-preparation overlay until that barrier completes.

Music controls use a small icon beside the game-credit display, with an accessible play/pause/unmute label and tooltip, rather than a song-title panel. Splash/login use their own compact icon placement. The asset name remains available to the administrator in the media library; this is a presentation change, not a media-metadata removal.

Playback is attempted automatically when eligible, subject to browser autoplay restrictions, the user's sound preference, page visibility, race preparation, and prayer pauses. A `NotAllowedError` keeps automatic intent pending and provides an explicit play button; an allowed user gesture can retry synchronously. Explicit pause or mute remains authoritative, and a late play promise cannot resume an ineligible track. Neither the public configuration request nor media streaming requires a session, and neither changes race simulation state. Admin upload/selection mutations retain authentication, role, CSRF, Origin, and prayer checks.

### `GET /admin/media`

Authenticated admin response: `{assets: MediaAsset[], settings: PresentationSettings, limits}`. `limits` contains `garageMusicBytes:20971520`, `loadingImageBytes:10485760`, `maxAssets:40`, and `totalBytes:262144000`. Assets are listed newest first. The settings row lock keeps the collection/settings response coherent with concurrent writes.

### `POST /admin/media/:kind?name=...`

Authenticated admin mutation with exact Origin, `X-CSRF-Token`, and prayer gating. `:kind` is `garage_music` or `loading_image`. The body is the actual binary file, **not JSON and not multipart**:

| Kind | Content-Type | Input limit | Content validation |
| --- | --- | --- | --- |
| `garage_music` | `audio/mpeg` | 20 MiB | Complete MPEG Layer III frame sequence, maximum 60 minutes; MPEG1/2/2.5 and CBR/VBR supported |
| `loading_image` | `image/jpeg` | 10 MiB | JPEG fully decoded and encoded again; maximum 8192 pixels per side and 24 megapixels |

`name` is a URL-encoded display filename containing 1–120 characters without folder separators. The server does not use it as a filesystem path. HTTP-compressed upload bodies are rejected. Authentication and authorization run before the binary body reader. The existing JSON body limit remains in force for other mutations.

JPEG autoorientation and sRGB conversion run before quality-92 output; EXIF/GPS metadata is not retained. MP3 ID3/APE tags are removed while encoded audio frames are preserved. File extensions alone do not establish validity. Invalid/truncated content returns `INVALID_JPEG` or `INVALID_MP3`; wrong MIME returns `MEDIA_TYPE_REQUIRED`; excessive size returns `MEDIA_TOO_LARGE`.

HTTP `201` returns `{asset: MediaAsset}`. Uploading does not activate a file. The normalized content hash deduplicates a repeated upload, returning the existing asset without another audit row or storage allocation. A serialized quota check limits the complete collection to 40 files / 250 MiB (`MEDIA_LIBRARY_FULL`). Upload attempts also use the account throttle. Media content is immutable: changing bytes creates another UUID, and database triggers reject updates to asset rows.

### `PUT /admin/presentation`

Authenticated admin mutation, with JSON, CSRF, Origin, and prayer checks. Body:

```json
{
  "expectedVersion": 1,
  "garageMusicId": "uploaded MP3 UUID or null",
  "loadingImageId": "uploaded JPEG UUID or null",
  "musicVolume": 0.35,
  "reason": "Musik dan ilustrasi untuk sesi latihan"
}
```

Use real JSON `null` to clear a selection. Both selection fields and the volume are required. IDs must exist and match the target media kind. Volume is finite in `[0,1]` and rounded to three decimals. `reason` contains 4–500 characters. The version check and selection/audit writes share one database transaction. A stale version returns `PRESENTATION_CHANGED`; the client must reload and review rather than silently overwrite another admin's changes. Response is the new `PresentationSettings` with an incremented numeric version.

The admin UI labels `loadingImageId` as **Gambar splash & loading** under **Musik & loading**. It selects one existing JPEG for both presentation surfaces; no additional splash-upload endpoint, media kind, or duplicate binary is introduced.

### `DELETE /admin/media/:id`

Authenticated admin mutation with JSON `{reason}` plus CSRF, Origin, and prayer checks. A file currently selected for either presentation slot returns `MEDIA_IN_USE`; first clear/change the selection and save the new settings. A successful removal returns `{deleted:true}` and appends an audit event. The audit stores metadata, not file bytes. Nonexistent IDs return `MEDIA_NOT_FOUND`.

### `GET /media/:id` and `HEAD /media/:id`

Public same-origin delivery of validated media bytes. A UUID always denotes the same content. Responses include the fixed validated `Content-Type`, `X-Content-Type-Options:nosniff`, `Cross-Origin-Resource-Policy:same-origin`, `Accept-Ranges:bytes`, `Content-Length`, a SHA-256 `ETag`, and `Cache-Control:public, max-age=31536000, immutable`. `Content-Disposition` uses a server-generated UUID filename.

One byte range is supported, including open-ended and suffix ranges. Valid ranges return `206` and `Content-Range`; invalid/multiple/unsatisfiable ranges return `416`. `HEAD` returns headers without reading/sending the content. `If-None-Match` supports `304`; `If-Range` with a matching validator permits partial delivery, otherwise the whole representation is sent. PostgreSQL reads just the requested byte substring for range delivery. These URLs are intended for game presentation, not private per-account attachments.

## Vehicle collection photos

Types are declared in `shared/vehicle-thumbnails.ts`. Migration **010** adds `vehicle_thumbnail_assets` and one `vehicle_thumbnail_slots` row for each vehicle. Slots begin at numeric version **1** with `thumbnail:null`. Photo versions are independent of `catalogVersion`, ownership, saved appearances, and the presentation music/loading version. Replacing a photo does not invalidate a purchase quote or change the active car.

The catalog response includes `thumbnail: VehicleThumbnail | null` on each car. Photo URLs are public, same-origin game assets. The four 1.5.0 vehicles have bundled user-reference PNGs in `/vehicle-photos/`, used only when `thumbnail` is null. Admin-uploaded same-origin UUID URLs retain priority. Removing an admin upload restores the bundled reference; other models fall back to an icon. Failed or invalid URLs use an icon. Bundled reference files do not create database thumbnail rows or loosen upload URL validation. The application displays a fixed 16:9 frame with `object-fit:contain`, lazy loading, and model-specific alternative text. It filters the Garage by permanent ownership; Showroom retains all catalog cars.

```ts
interface VehicleThumbnail {
  id: string; // UUID; changing photo bytes creates a new UUID
  url: string; // /api/vehicle-thumbnails/<UUID>
  mimeType: 'image/webp';
  bytes: number;
  width: number;
  height: number;
}
interface VehicleThumbnailSlot {
  carId: CarId;
  version: number;
  thumbnail: VehicleThumbnail | null;
}
```

### `GET /admin/vehicle-thumbnails`

Authenticated admin response: `{cars:VehicleThumbnailSlot[],limits}`. Limits are `inputBytes:4194304`, `inputPixels:16000000`, `maxWidth:512`, `maxHeight:288`, `outputBytes:524288`, and accepted MIME types `image/jpeg`, `image/png`, `image/webp`. No uploader identity is included in the public catalog metadata.

### `POST /admin/vehicle-thumbnails/:carId?expectedVersion=...&reason=...`

Authenticated admin mutation with exact Origin, session cookie, `X-CSRF-Token`, and prayer gating. Send the original file as the **raw binary body**, not multipart or JSON, with its matching `Content-Type`. `carId` must be a supported catalog vehicle. Query parameters contain the current slot version and a URL-encoded reason of 4–500 characters. The request is throttled by account. Authorization and prayer checks run before reading binary bytes.

Input is limited to **4 MiB / 16 megapixels**. The server checks the signature, decodes the complete image, rejects animation and malformed/truncated content, applies orientation, preserves aspect ratio, and fits it inside **512 × 288** without cropping or enlarging. It encodes sRGB WebP at quality 82, removes EXIF/GPS metadata, and enforces a maximum 512 KiB output. Original upload bytes are not retained.

HTTP `201` returns the complete updated `VehicleThumbnailSlot`. Photo upload and activation are one transaction: the slot row is locked, `expectedVersion` is checked, new bytes are inserted, the slot version increments, the old photo bytes are removed, and an audit event is appended. A stale version returns `409 THUMBNAIL_CHANGED` without overwriting the newer photo. Reload and review before resubmission. Each vehicle retains one photo, and public UUIDs are never reused. Neither successful nor rejected uploads debit the wallet or mutate the purchase/access/tuning tables.

Invalid formats return `THUMBNAIL_TYPE_REQUIRED` or `INVALID_THUMBNAIL`; an oversized body returns `THUMBNAIL_TOO_LARGE`; animated input returns `ANIMATED_THUMBNAIL`. A canceled network request may have committed on the server; reload the slot rather than assuming cancellation rolled back a completed upload.

### `DELETE /admin/vehicle-thumbnails/:carId`

Authenticated admin mutation with JSON `{expectedVersion,reason}`, CSRF, Origin, and prayer checks. The UI asks for confirmation and an audit reason. The same version check applies. A successful transaction returns the incremented `VehicleThumbnailSlot` with `thumbnail:null`, removes the old photo bytes, and records `vehicle.thumbnail.deleted`. An empty slot returns `409 THUMBNAIL_EMPTY`. This does not delete the vehicle or its ownership.

### `GET /vehicle-thumbnails/:id` and `HEAD /vehicle-thumbnails/:id`

Public delivery of normalized WebP with fixed content type, `nosniff`, same-origin resource policy, content length, last-modified time, a SHA-256 ETag, and `Cache-Control:public, max-age=31536000, immutable`. `If-None-Match` supports `304`; HEAD sends metadata without loading the blob. Byte ranges are not needed for these small photos. After replacement/deletion, a fresh request for the old UUID returns `404 THUMBNAIL_NOT_FOUND`; already cached bytes may remain in a browser. Reloading the catalog selects the new immutable URL or the fallback icon.

## Server integration and operations

```ts
import {createPool} from './db/pool.js';
import {migrate} from './db/migrate.js';
import {createServices} from './services/index.js';
import {createApiRouter} from './routes/index.js';

const pool = createPool(); // DATABASE_URL is mandatory
await migrate(pool);
const services = createServices(pool);
app.use(express.json({limit:'32kb'}));
app.use('/api', createApiRouter({services, allowedOrigins:[appOrigin], secureCookies}));
```

`scripts/migrate.ts` loads `.env`, runs checksum-verified migrations under a PostgreSQL advisory transaction lock, and seeds the initial catalog/ruleset. It creates no admin account.

Before starting a server upgraded to **1.5.0**, run `npm run db:migrate` against the existing database to apply all pending migrations through **015_suv_catalog.sql**; the Compose startup already performs migrations. Preserve `.env` and the database/volume. Migration 014 adds `vehicle_categories` and `vehicle_category_assignments` and their initial mappings without resetting accounts, balances, ownership, customization, offer prices/versions, or published rulesets.

`scripts/admin-create.ts` requires explicit `ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME` and `ADMIN_PASSWORD`, or prompts in a TTY with hidden password entry. It creates a new administrator and audit entry, and refuses to overwrite an existing account. Use deployment secrets rather than storing the password in a committed file.

Passwords use scrypt `N=131072, r=8, p=1`, a random 16-byte salt and a 32-byte derived key. This follows the [OWASP scrypt baseline](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Derivation runs with two concurrent jobs and a bounded queue. Persistent 15-minute throttles limit registration to 10/IP, login to 40/IP and 20/email, and race ticket issuance to 120/session. CSRF uses a session synchronizer token with Origin checking, following the [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

The actual-PostgreSQL suites are `server/services/__tests__/*.integration.test.ts`, including appearance/access and prayer tests. It requires `TEST_DATABASE_URL` pointing to a database whose name contains `test`, creates an isolated schema, runs migrations and removes only that schema afterward. It does not fall back to an in-memory database. `server/services/__tests__/response-fixtures.json` contains real service responses captured from synthetic accounts in an isolated test database, with no passwords or session tokens.
