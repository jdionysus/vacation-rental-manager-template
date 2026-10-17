# Vacation Rental Manager

A self-hosted app for managing a short-term rental. It gives you a public listing, guest portal, reservations, calendar, tasks, pricing, iCal feeds, and a host dashboard.

This is a **clean starter template**. It has no real address, guest data, access codes, booking links, property photos, or credentials. Your property information belongs in your database and host dashboard, not in GitHub.

## Start here: let Manus set it up

You do not need to understand the code to launch your own copy. You need a GitHub account, a [DigitalOcean account](https://cloud.digitalocean.com/), and a Manus account.

### 1. Connect GitHub to Manus

Open [Manus Connectors](https://manus.im/app/all/connector_bbb0df76-66bd-4a24-ae4f-2aac4750d90b), select **GitHub**, and choose **Connect**. Sign in to GitHub and approve access to the repositories you want Manus to use.

You only do this once. Afterwards, Manus can create repositories, commit changes, and deploy changes for the repositories you allow. See the official [Manus GitHub connector guide](https://manus.im/connectors/github) if the connection screen looks different.

### 2. Make your own private copy

For a real rental, ask Manus to create a **private copy** rather than clicking GitHub’s **Fork** button. A fork of this public repository must also remain public, so a normal fork is not the right place for future property-specific work. GitHub explains this visibility rule in its [fork documentation](https://docs.github.com/en/pull-requests/reference/forks).

Open a new Manus task and paste this:

```text
Create a new private GitHub repository named MY-RENTAL-MANAGER from
https://github.com/jdionysus/vacation-rental-manager-template.

Do not create a GitHub fork and do not preserve upstream Git history.
Do not put my property address, guest data, access codes, photos, URLs,
or secrets in source code or GitHub. Keep those in the deployed database
and encrypted hosting settings.
```

Replace `MY-RENTAL-MANAGER` with a name you like. Manus should give you a new private repository URL when it is finished.

### 3. Create a short-lived DigitalOcean token

1. In DigitalOcean, open **Account** → **API**, then select **Generate New Token**. The official [token guide](https://docs.digitalocean.com/reference/api/create-personal-access-token/) has screenshots.
2. Name it something clear, such as `manus-rental-setup`, and give it an expiration date. It only needs to last through setup.
3. Choose custom scopes. For an App Platform deployment, grant the requested App Platform read/create/update permissions and their required read permissions. If you want Manus to create a managed MySQL database too, also grant the requested database create/read/update permissions. DigitalOcean lists [App Platform scope requirements](https://docs.digitalocean.com/reference/api/scopes/app/update/).
4. Copy the token when DigitalOcean shows it. It is displayed only once.

Treat this token like a password. Give it to Manus only through a secure credential prompt or connector setup, not in a GitHub issue, commit, repository secret file, or public chat. Delete the token after setup if you do not need Manus to keep managing DigitalOcean.

### 4. Ask Manus to create the app

Open a Manus task, select your private repository, and paste the prompt below. Replace the repository name and region if needed.

```text
Deploy my private GitHub repository MY-ACCOUNT/MY-RENTAL-MANAGER to
DigitalOcean App Platform using the DigitalOcean token I will provide
securely.

During the DigitalOcean Create App flow, select GitHub as the source and
authorize DigitalOcean to read this repository if it asks. The repository
already contains the complete application; do not create an empty app first.

Use one Node web service and a new managed MySQL database in the region
closest to my guests. Keep the database and all property data private.
Run the database migrations safely once, then deploy from the main branch.

Set DATABASE_URL and a newly generated long JWT_SECRET as encrypted
DigitalOcean environment variables. Set NODE_ENV=production. Make sure
DigitalOcean's public HTTP port matches the app's PORT setting (the app
uses port 3000 when PORT is not set). Do not put secrets in VITE_* variables.

Create an initial host account in the database with a password collected
through a secure prompt, not in source code. Create an empty property
record so I can finish setup in the host dashboard.

Before creating paid resources, show me the proposed App Platform and
managed-database plan, region, and estimated cost. After I approve,
create the resources, verify the live URL, and give me the URL plus a
short list of what you configured.
```

Manus should handle the technical deployment steps. DigitalOcean App Platform builds from a GitHub branch and can automatically redeploy when you push future changes. See DigitalOcean’s [App Platform overview](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/).

DigitalOcean asks for GitHub access **at this app-creation step**, after your private repository already exists and contains the template code. A DigitalOcean token does not by itself grant access to a private GitHub repository.

### 5. Add your property information

When Manus gives you the live URL, open:

```text
https://YOUR-APP-URL/host
```

Sign in with the first host account created during deployment. Use the host dashboard to add and manage your real information:

1. Open **Property Settings** for the name, listing text, address, photos, check-in/out times, and public SEO text.
2. Open **Guest Pages** for arrival instructions, Wi-Fi, house rules, local recommendations, and any other guest-facing content.
3. Open **iCal Feeds** to connect Airbnb, Vrbo, or other calendar feeds.
4. Open **OTA Links** for your booking or listing links.
5. Open **Bypass Codes** only if you intentionally need staff or guest codes. Use unique codes, do not reuse door-lock codes, and never put them in GitHub.
6. Open **Team** to add managers, cleaners, accountants, or co-hosts.

Once the app is live, property details stay in the database. You should not need to edit code just to change your listing or guest information.

### 6. Put Cloudflare in front of the live app

Do this after the DigitalOcean URL works. Cloudflare gives you a custom domain, HTTPS at the edge, bot controls, and a firewall. It is optional for a test install, but strongly recommended before sharing a guest or staff portal.

#### Add your custom domain

1. Add your domain to [Cloudflare](https://dash.cloudflare.com/) and complete its DNS setup with your domain registrar if it is not already there.
2. In DigitalOcean, open **Apps** → your app → **Networking** → **Domains** → **Add domain**. Select **You manage your domain**. DigitalOcean will show a CNAME target ending in `ondigitalocean.app`.
3. In Cloudflare **DNS**, create the CNAME record that DigitalOcean specifies. A subdomain such as `stay.yourdomain.com` is the simplest first choice. Set it to **DNS only** (the gray cloud) until DigitalOcean reports that the domain and certificate are active.
4. Visit the custom domain and make sure the site works over `https://`. Then switch the Cloudflare DNS record to **Proxied** (the orange cloud). That sends visitor traffic through Cloudflare so its firewall can protect it.
5. Ask Manus to redirect the default `ondigitalocean.app` URL to the custom domain and test that direct visits no longer serve the app. Otherwise, someone could bypass Cloudflare by using the starter URL.

DigitalOcean documents this process in its [App Platform domains guide](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/).

#### Turnstile: do this in two parts

Cloudflare Turnstile helps stop automated logins, access-code guesses, and form spam. In Cloudflare, open **Turnstile** → **Add widget**, name it something like `Rental Manager - Production`, and add your exact custom hostname, such as `stay.yourdomain.com`.

Cloudflare gives you a public **site key** and a private **secret key**. Set the site key in DigitalOcean as `VITE_TURNSTILE_SITE_KEY`, then redeploy. Store the secret only as an encrypted DigitalOcean variable called `TURNSTILE_SECRET_KEY`. Never put the secret key in GitHub or a `VITE_` variable.

**Important:** this template currently displays the Turnstile widget when a site key is set, but it does not yet validate the token on the server. A visible widget alone does not stop a bot. Cloudflare requires the server to send each token to its Siteverify API. Do not rely on Turnstile as protection until that server-side step is added. See Cloudflare’s [Turnstile setup guide](https://developers.cloudflare.com/turnstile/get-started/) and [server-side validation guide](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Ask Manus to make Turnstile complete with this prompt:

```text
Use my private rental-manager repository and deployed DigitalOcean app.
Add complete Cloudflare Turnstile server-side validation before relying on it.

Use VITE_TURNSTILE_SITE_KEY only in the browser and read TURNSTILE_SECRET_KEY
only on the server from an encrypted DigitalOcean variable. Send the token with
the form request, validate it with Cloudflare Siteverify on the server, and
reject missing, invalid, expired, reused, or wrong-hostname tokens.

Protect host login, guest access-code verification, cleaner and staff gates,
guestbook submissions, feedback submissions, and issue reports. Do not log
tokens or secrets. Test the live custom domain before deploying, and explain
the exact files changed.
```

#### Add Cloudflare firewall rules

First make sure the custom-domain DNS record is **Proxied**. Cloudflare rules do not protect traffic sent directly to the DigitalOcean starter URL.

In Cloudflare, go to **Security** → **Security rules**. Start with two rate limits:

1. Create `Rental manager: sign-in and codes`. Match `/api/trpc/auth.login`, `/api/trpc/guest.verifyCode`, `/api/trpc/bypassCodes.verify`, and `/api/trpc/cleaner.verifyCode`. Count by visitor IP. Start with **10 requests in 1 minute** and a **10-minute Managed Challenge** or block action after the limit.
2. Create `Rental manager: public forms`. Match `/api/trpc/guestbook.submit`, `/api/trpc/feedback.submit`, and `/api/trpc/issues.report`. Count by visitor IP. Start with **30 requests in 5 minutes** and a Managed Challenge.
3. Review **Security Events** after launch. If a rule catches legitimate guests, raise the limit before using a block action. Cloudflare’s [rate-limit guide](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/) shows the dashboard steps.
4. Use a **Custom rule** only for a specific problem you have observed, such as a persistently abusive IP. Start with Managed Challenge, review Security Events, then escalate to Block only when you are confident it will not affect guests. Cloudflare’s [custom-rule guide](https://developers.cloudflare.com/waf/custom-rules/create-dashboard/) explains how to create rules safely.

Do not block an entire country, challenge every `/api/` request, or block all traffic by default. Broad rules can prevent legitimate guests, cleaners, and booking platforms from using the portal.

## Make future changes with Manus

For a design or feature change, open a Manus task, select your private repository, and describe the change in ordinary language. This prompt is a good default:

```text
Use my private repository MY-ACCOUNT/MY-RENTAL-MANAGER.
Read README.md first. Make the following change: [DESCRIBE WHAT YOU WANT].
Do not place property data, guest data, passwords, access codes, or tokens
in source code. Work on a new branch, test the change, and show me what
will change before deploying it.
```

For a deployment problem, use this instead:

```text
Use my private repository MY-ACCOUNT/MY-RENTAL-MANAGER and my DigitalOcean
App Platform app. Inspect the deployment logs and diagnose why the current
production deployment failed. Do not delete or recreate the database.
Explain the smallest safe fix before making it.
```

## Keep these things out of GitHub

Never paste any of the following into code, a README, screenshots, issues, commits, or a `.env` file that you commit:

- Door-lock, garage, Wi-Fi, or staff access codes
- Guest names, email addresses, phone numbers, stays, payments, or messages
- Property address, private host contact details, photos, or unlisted booking links
- DigitalOcean tokens, database passwords, Stripe secret keys, or session secrets
- Database backups, exported calendars, printed QR cards, or house manuals containing real information

Use the host dashboard for property content and DigitalOcean’s encrypted environment-variable settings for secrets. DigitalOcean explains how to [add and encrypt environment variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/).

---

## Technical reference

Everything above is enough for the normal Manus + GitHub + DigitalOcean path. This section is for a developer or for a Manus task that asks for exact project settings.

### Required deployment configuration

This is a Node web service. The standard production commands are:

```text
Build command: pnpm build
Run command:   pnpm start
Public port:   3000 (or set PORT and make the App Platform HTTP port match it)
```

Run the database migration as a controlled one-time step after the MySQL database exists:

```bash
pnpm db:push
```

Do not run schema changes blindly against an existing production database. Back it up first and have the deployment task review the migration plan.

At minimum, configure these values outside GitHub:

| Variable | Where to set it | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Encrypted DigitalOcean variable | Required. A MySQL connection string. Make it available to the migration step and the running app. |
| `JWT_SECRET` | Encrypted DigitalOcean variable | Required. Generate a long random value unique to this deployment. |
| `NODE_ENV` | DigitalOcean variable | Set to `production`. |
| `PORT` | DigitalOcean variable, if needed | Must match App Platform’s configured HTTP port. The app defaults to `3000`. |
| `VITE_TURNSTILE_SITE_KEY` | Build-time or `RUN_AND_BUILD_TIME` DigitalOcean variable | Optional public Cloudflare Turnstile site key. It is allowed to appear in browser code, but it is not a secret. |
| `TURNSTILE_SECRET_KEY` | Encrypted runtime DigitalOcean variable | Add only after server-side Turnstile validation has been implemented. Never expose it to the browser. |

Values beginning with `VITE_` are sent to every visitor’s browser. Never put a password, API secret, database URL, or access code in one.

### Optional integrations

The app can also use third-party services. Configure only the features you need, and keep server-side credentials encrypted:

- **Cloudflare Turnstile**: Optional bot protection for login and access-code forms. It is not complete until the browser token is validated on the server with `TURNSTILE_SECRET_KEY`; follow the post-launch instructions above.
- **Stripe**: Only configure it if you enable payment collection or damage charges. Keep Stripe secret and webhook keys encrypted; the publishable key is the only browser-facing value.
- **Google Maps**: If you enable map features, use a separate browser key restricted to your domain and the Maps APIs you actually use.
- **iCal feeds**: Add feed URLs in the host dashboard. They are operational data and should never be committed to the repository.

### Local development

For local work, install a current Node.js version with Corepack, make an untracked `.env` file, then run:

```bash
corepack enable
pnpm install
pnpm db:push
pnpm dev
```

Before you push a code change, run:

```bash
pnpm check
pnpm build
pnpm test
```

### Useful official resources

- [Manus GitHub connector](https://manus.im/connectors/github)
- [Manus connector help](https://help.manus.im/en/articles/12231777-how-can-i-use-manus-connectors)
- [GitHub repository fork rules](https://docs.github.com/en/pull-requests/reference/forks)
- [DigitalOcean App Platform: create an app](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/)
- [DigitalOcean App Platform: environment variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
- [DigitalOcean personal access tokens](https://docs.digitalocean.com/reference/api/create-personal-access-token/)
- [DigitalOcean App Platform app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [DigitalOcean App Platform: custom domains](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/)
- [Cloudflare Turnstile setup](https://developers.cloudflare.com/turnstile/get-started/)
- [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare WAF rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)
- [Cloudflare WAF custom rules](https://developers.cloudflare.com/waf/custom-rules/create-dashboard/)

## License

No open-source license has been selected for this repository yet. Add a license before relying on permissions to copy, modify, or redistribute the code.
