# Vacation Rental Manager

A self-hosted React, Express, tRPC, and Drizzle application for running a short-term rental. It includes a public listing, guest portal, reservation calendar, task tracking, iCal synchronization, pricing, and host administration.

This repository is a **generic template**. It intentionally contains no real property address, contact information, booking URLs, guest records, access codes, QR codes, property media, or deployment credentials.

## Before you deploy

1. Create a new MySQL-compatible database and set `DATABASE_URL`.
2. Generate a long random `JWT_SECRET`.
3. Run the Drizzle migrations in `drizzle/` to create the schema.
4. Sign in to the host portal and use **Property Settings**, **Guest Pages**, **OTA Links**, **iCal Feeds**, and **Bypass Codes** to add your own property data.
5. Optional: set `VITE_TURNSTILE_SITE_KEY` with a Turnstile site key for your own deployment domain before exposing guest or staff gates publicly.
6. Do not commit `.env` files, database dumps, printed guest materials, access codes, or guest/reservation exports.

## Development

```bash
pnpm install
pnpm db:push
pnpm dev
```

Run the available checks before publishing changes:

```bash
pnpm typecheck
pnpm build
pnpm test
```

## Data boundary

Property identity and operational data belong in the database, not in application source:

- Property name, address, check-in/out information, host contacts, Wi-Fi information, and guest-guide content
- Guest, reservation, calendar, feedback, task, damage, and financial records
- OTA URLs, iCal URLs, access/bypass codes, and service credentials

The source code should contain only behavior, schemas, generic UI text, and non-sensitive examples. `VITE_*` values are shipped to browsers, so never place secrets in them.

## Environment variables

At minimum, configure these outside Git:

```text
DATABASE_URL=mysql://...
JWT_SECRET=long-random-secret
VITE_TURNSTILE_SITE_KEY=optional-public-site-key
```

The application may have additional OAuth or storage variables depending on your hosting provider. Keep all real values in the provider’s secret manager or local untracked `.env` file.

## License

Choose and add an open-source license before making your derivative repository public.
