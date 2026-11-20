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

Typical statuses are `400` for invalid input, `401` for missing/invalid authentication, `403` for ownership/CSRF/origin/role failures, `404` for missing resources, `409` for version or idempotency conflicts, `415` for a non-JSON mutation and `429` for throttling.

### Idempotency

`POST /shop/purchase` and `POST /admin/topups` require an `Idempotency-Key` header containing 8–128 characters. Generate the key once for the user action and reuse it on timeout/retry. The same key with the same payload returns the previously committed response; the same key with a different payload returns `IDEMPOTENCY_CONFLICT`.

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
    "color":"#2866b8","rimColor":"#c7cdd4","finish":"metallic","version":"1"
  },
  "statistics": {"races":0,"wins":0,"rewards":"0"}
}
```

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
  "wheels": []
}
```

Each car has `id`, `itemId` (same as `id`), `kind:"car"`, `name`, `price`, `catalogVersion`, `enabled`, `color`, `drive`, `stats:{topSpeed,zeroTo100,handling}`, the same three stats at the top level for UI compatibility, and `tuningVersion`. The starter car also has `starter:true`.

Each wheel has `id`, `itemId`, `kind:"wheel"`, `name`, `price`, `catalogVersion`, `enabled`, `color`, `cosmeticOnly:true`, and optional `spokes`/`starter`. Wheel selection and wheel color do not modify vehicle stats.

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

Authenticated, with CSRF. Body:

```json
{
  "carId":"brz",
  "rimId":"six-spoke",
  "color":"#2866b8",
  "rimColor":"#d7b56d",
  "finish":"metallic"
}
```

`wheelId` is an accepted alias for `rimId`; if both are supplied, they must agree. If neither wheel field is supplied, stock wheels are selected. `rimColor` is optional; omission preserves the saved wheel color. Both paint fields use `#RRGGBB` and are normalized to lower case. Finish is `metallic`, `gloss` or `matte`.

The server requires ownership of both the car and wheel. Invalid or unowned selections leave the previous complete loadout unchanged. Returns `{loadout:{carId,rimId,wheelId,color,rimColor,finish,version}}`. The selected wheel color is persisted across sessions and included in multiplayer snapshots.

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

Contracts for race inputs/results are defined in `shared/types.ts`. `resolveLoadout` checks ownership and returns a frozen choice containing `carId`, `rimId`, `color`, `rimColor`, `finish`, `stats`, `tuningVersion` and `partVersion`. An omitted `rimColor` falls back to the saved value. A specified ruleset version loads that immutable version instead of the currently active one.

The room obtains one ruleset for everyone before countdown. `beginRace` persists the configuration, participant identities and frozen loadouts, including bots. Settlement rejects a different participant/configuration snapshot, writes results and wallet entries atomically, and is idempotent by race ID. Repeating the same final result returns the saved settlement; changing an already-finalized result returns `RESULT_CONFLICT`.

The client cannot supply a reward amount or settle a race through an HTTP endpoint. The authoritative room simulation supplies checkpoint/lap/finish outcomes. Reward calculation uses the ruleset saved for that race, even if an admin has published a new one.

Initial reward policy is 10000 credits for a valid finish, plus 1000 per completed lap, plus podium bonuses of 15000/8000/4000 for positions 1/2/3, capped at 50000. A finish must take at least 15000 simulation milliseconds. DNF earns zero. Bots receive no wallet entries. Fixed-tick simulation time may trail wall time under server load without blocking settlement.

`abortInterruptedRaces()` is available for a **single-server startup** before accepting rooms. It marks unfinished persisted races aborted without a payout. Do not call it on each worker in a multi-server deployment.

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

Body: `{price?:string, enabled?:boolean, expectedVersion:number, reason:string}`. Supply at least one changed offer field. Prices may be zero. A stale version returns `CATALOG_CHANGED`.

Response: `{item:{id,kind,name,price,enabled,catalogVersion}}`. Each accepted update increments the offer version and writes an audit event.

### `GET /admin/tuning`

Returns `{version,bounds,physics,rewardPolicy,cars:[{carId,topSpeed,zeroTo100,handling}]}` for the active ruleset. All tuning values are numeric.

### `POST /admin/tuning/publish`

Body:

```json
{"expectedVersion":"1","carId":"brz","topSpeed":255,"zeroTo100":5.6,"handling":1.18,"reason":"Describe the balancing change"}
```

Bounds: `topSpeed` 120–450 km/h; `zeroTo100` 1.8–15 seconds; `handling` 0.6–1.6. Top speed and acceleration time are rounded to two decimal places, handling to three. These are arcade simulation settings.

Publishes an immutable ruleset containing all eight cars. Unchanged cars are copied forward. `expectedVersion` accepts a positive integer or its decimal string. A stale version returns `RULESET_CHANGED`. Response: `{version,previousVersion,appliesTo:"new-races",car,rewardPolicy}`.

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

The actual-PostgreSQL suite is `server/services/__tests__/backend.integration.test.ts`. It requires `TEST_DATABASE_URL` pointing to a database whose name contains `test`, creates an isolated schema, runs migrations and removes only that schema afterward. It does not fall back to an in-memory database. `server/services/__tests__/response-fixtures.json` contains real service responses captured from synthetic accounts in an isolated test database, with no passwords or session tokens.
