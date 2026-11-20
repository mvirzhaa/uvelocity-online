# UVelocity HTTP API and persistence contract

All routes below are relative to `/api`. The API stores accounts, sessions, ownership, credit balances, race results and published tuning in PostgreSQL. `Rp` denotes **virtual game credits** (`RP_GAME`), with no payment gateway, cash withdrawal or cash redemption in this implementation.

## Authentication and request conventions

- JSON request bodies use `Content-Type: application/json`.
- Every state-changing HTTP request must include an `Origin` exactly matching a configured application origin. Missing origins, foreign origins and `Sec-Fetch-Site: cross-site` are rejected.
- Login and registration do not require an existing session. Every other authenticated mutation also requires `X-CSRF-Token`, obtained from login, registration or `GET /auth/me`.
- Authentication uses an opaque `uv_session` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/` and an absolute seven-day expiry. `Secure` is enabled by default when `NODE_ENV=production`; the main server can explicitly configure it. Session tokens are hashed before storage. Never put them into browser local storage or URLs.
- Race admission uses a separate short-lived one-time ticket, described below.
- All balances, prices, rewards and ledger amounts are **decimal strings**, for example `"25000"`. Wallet and loadout versions are also strings. Catalog versions are numbers; ruleset versions are strings.
- Money calculations use integer PostgreSQL `BIGINT` and Node.js `BigInt`. The wallet limit is `1000000000000000` credits. A manual top-up or catalog price cannot exceed `1000000000000` credits.
- API responses use `Cache-Control: no-store`.
- Errors have this shape:

```json
{"error":{"code":"INSUFFICIENT_BALANCE","message":"Kredit game tidak mencukupi."}}
```

Typical statuses are `400` for invalid input, `401` for missing/invalid authentication, `403` for ownership/CSRF/origin/role failures, `404` for missing resources, `409` for version or idempotency conflicts, `415` for a non-JSON mutation `423` for an active personal prayer break, and `429` for throttling.

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
    "color":"#2866b8","rimColor":"#c7cdd4","finish":"metallic",
    "stripeId":"none","stripeColor":"#ffffff","version":"1","appearanceVersion":"1"
  },
  "statistics": {"races":0,"wins":0,"rewards":"0"}
}
```

`accessibleCars` also lists every car currently usable, including temporary admin-open cars. `appearances` contains `{carId,rimId,color,finish,rimColor,stripeId,stripeColor,version,owned,canCustomize}` per accessible car. Permanent cars keep their saved appearance. Temporary cars use factory appearance with `owned:false`, `canCustomize:false`, and version `"0"`. If the active temporary car has been relocked, reading the profile repairs the active choice to a permanently owned car without changing any running race.

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
  "cars": [],
  "wheels": [],
  "services": [],
  "stripes": []
}
```

Each car has `id`, `itemId` (same as `id`), `kind:"car"`, `name`, `price`, `catalogVersion`, `enabled`, `locked`, `color`, `drive`, `stats:{topSpeed,zeroTo100,handling}`, the same three stats at the top level for UI compatibility, and `tuningVersion`. The starter car also has `starter:true`.

Each wheel has `id`, `itemId`, `kind:"wheel"`, `name`, `price`, `catalogVersion`, `enabled`, `color`, `cosmeticOnly:true`, and optional `spokes`/`starter`. Wheel selection and wheel color do not modify vehicle stats.

`locked` controls free use independently of `enabled` (sale availability). Permanent ownership always grants use, even when locked or not for sale. `services` contains paid paint and stripe services; `stripes` is the five install-service subset. The seven new reference-based models also expose `modelOrigin` and `modelNote`.

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
| `jesko-absolut` | Koenigsegg Jesko Absolut | 2400000 |
| `venom-f5` | Hennessey Venom F5 | 2200000 |
| `stock` | Roda bawaan | 0; starter |
| `six-spoke` | Six Spoke | 20000 |
| `multi-spoke` | Multi Spoke | 35000 |
| `mesh` | Mesh Gold | 50000 |

Prices and tuning are game design values, not market prices or manufacturer performance specifications.

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

Returns `{loadout:{carId,rimId,wheelId,color,rimColor,finish,stripeId,stripeColor,version,appearanceVersion}}`. Switching between saved cars does not debit credits. Changing an owned rim selection updates that vehicle's saved appearance. Temporary admin-open vehicles use factory cosmetics and an owned wheel; they cannot purchase custom appearance until permanently acquired.

### `POST /garage/appearance/quote`

Authenticated, with CSRF. Body contains `carId` and any desired `rimId`, `color`, `finish`, `rimColor`, `stripeId`, or `stripeColor`. Colors are normalized `#RRGGBB`. Finish is `metallic`, `gloss`, or `matte`. Stripe IDs are `none`, `twin-racing`, `offset`, `side-sweep`, `circuit`, and `heritage`. Custom rim paint requires a non-stock owned wheel. Paid customization requires permanent car ownership.

Returns `{quoteId,carId,appearanceVersion,selection,currentAppearance,lineItems,total,wallet,affordable,noOp,expiresAt}`. Each line item contains `{itemId,name,price,catalogVersion}`. The server stores this offer for **10 minutes**; creating it does not debit credits or change appearance. `total` and line prices are decimal strings. A quote can be returned even when the wallet is currently insufficient so the UI can show the exact cost.

Initial services: `paint-body` 10000, `paint-rims` 5000, `stripe-twin-racing` 15000, `stripe-offset` 18000, `stripe-side-sweep` 12000, `stripe-circuit` 20000, `stripe-heritage` 22000, `stripe-remove` 5000. Body color and finish changed together form one paint charge. Changing stripe color uses the selected design's installation price. Identical appearance incurs no cosmetic charge.

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

Initial reward policy is 10000 credits for a valid finish, plus 1000 per completed lap, plus podium bonuses of 15000/8000/4000 for positions 1/2/3, capped at 50000. A finish must take at least 15000 simulation milliseconds. DNF earns zero. Bots receive no wallet entries. Fixed-tick simulation time may trail wall time under server load without blocking settlement.

`abortInterruptedRaces()` is available for a **single-server startup** before accepting rooms. It marks unfinished persisted races aborted without a payout. Do not call it on each worker in a multi-server deployment.

## Arena and shared prayer protocol

The loading barrier is separate from lobby readiness. After all players are ready and the host requests start, the server broadcasts `phase:"loading"`, a unique `startToken`, and `loadingDeadline`. Every client must load the actual models, build/apply the grid, and observe a visible rendered arena frame before sending `arena_ready {raceId,startToken}`. `members[].arenaReady` exposes the current barrier. Loading failure sends `arena_failed {raceId,startToken,reason}`. Timeout after 45 seconds, unready, disconnect, or cancellation returns the room to lobby and invalidates old acknowledgments. Only the completed barrier may persist/start a race and broadcast one common countdown deadline.

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

Body: `{price?:string, enabled?:boolean, locked?:boolean, expectedVersion:number, reason:string}`. Supply at least one changed offer field. `locked` is accepted only for cars. `locked:false` allows temporary free use but never grants inventory; `locked:true` revokes free use for players without permanent ownership. Paid owners remain entitled, and a running race retains its frozen loadout. Service items can change price/availability through the same route. Prices may be zero. A stale version returns `CATALOG_CHANGED`.

Response: `{item:{id,kind,name,price,enabled,locked,catalogVersion}}`. Each accepted update increments the offer version and writes an audit event.

### `GET /admin/tuning`

Returns `{version,bounds,physics,rewardPolicy,cars:[{carId,topSpeed,zeroTo100,handling}]}` for the active ruleset. All tuning values are numeric.

### `POST /admin/tuning/publish`

Body:

```json
{"expectedVersion":"1","carId":"brz","topSpeed":255,"zeroTo100":5.6,"handling":1.18,"reason":"Describe the balancing change"}
```

Bounds: `topSpeed` 120–450 km/h; `zeroTo100` 1.8–15 seconds; `handling` 0.6–1.6. Top speed and acceleration time are rounded to two decimal places, handling to three. These are arcade simulation settings.

Publishes an immutable ruleset containing all fifteen cars. Unchanged cars are copied forward. `expectedVersion` accepts a positive integer or its decimal string. A stale version returns `RULESET_CHANGED`. Response: `{version,previousVersion,appliesTo:"new-races",car,rewardPolicy}`.

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

`limit` is 1–100. Returns `{entries:[{id,actorId,actorName,action,targetId,reason,before,after,createdAt}]}`. Events include `admin.created`, `wallet.topup`, `catalog.updated` and `ruleset.published`. Audit rows are append-only.

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

`scripts/admin-create.ts` requires explicit `ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME` and `ADMIN_PASSWORD`, or prompts in a TTY with hidden password entry. It creates a new administrator and audit entry, and refuses to overwrite an existing account. Use deployment secrets rather than storing the password in a committed file.

Passwords use scrypt `N=131072, r=8, p=1`, a random 16-byte salt and a 32-byte derived key. This follows the [OWASP scrypt baseline](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Derivation runs with two concurrent jobs and a bounded queue. Persistent 15-minute throttles limit registration to 10/IP, login to 40/IP and 20/email, and race ticket issuance to 120/session. CSRF uses a session synchronizer token with Origin checking, following the [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

The actual-PostgreSQL suites are `server/services/__tests__/*.integration.test.ts`, including appearance/access and prayer tests. It requires `TEST_DATABASE_URL` pointing to a database whose name contains `test`, creates an isolated schema, runs migrations and removes only that schema afterward. It does not fall back to an in-memory database. `server/services/__tests__/response-fixtures.json` contains real service responses captured from synthetic accounts in an isolated test database, with no passwords or session tokens.
