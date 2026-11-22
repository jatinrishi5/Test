# JRishiCPAs — website

A responsive website for **JRishiCPAs**, an online Canadian tax and accounting firm founded by Jatin Rishi. The front end is plain HTML, CSS and a little vanilla JavaScript (no build step). Form submissions are saved by two small Vercel Functions into a Supabase (Postgres) database.

- **Main site (Vercel):** <https://jrishicpas.vercel.app>
- GitHub Pages copy: <https://jatinrishi5.github.io/Test/> (its forms post to the Vercel API)

## Viewing the site

**Locally:** open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

The pages work locally, but form submissions need the Vercel Functions. To run those locally use the Vercel CLI (`vercel dev`) with the environment variables below.

**Vercel:** the project `jrishicpas` is linked to this repository. Every push to `main` deploys to production; other branches and pull requests get preview deployments.

**GitHub Pages:** also published from `main`, `/ (root)`.

## Backend

| Piece | What it does |
| --- | --- |
| `api/consultation.js` | `POST /api/consultation`: validates a booking-form request and inserts it into `consultation_requests` |
| `api/subscribe.js` | `POST /api/subscribe`: adds an email to `newsletter_subscribers` (duplicates count as success) |
| `api/_supabase.js` | Shared helpers: CORS for the GitHub Pages copy, input cleaning, and the Supabase REST insert |
| Supabase project `jrishicpas` | Region `ca-central-1`. Tables `consultation_requests` and `newsletter_subscribers` |

**Security.** Row Level Security is on for both tables. The publishable key used by the functions may only `INSERT`; it cannot read, update or delete rows. Both forms include a hidden "honeypot" field that silently discards bot submissions, and the functions never log visitors' personal details.

**Environment variables** (set in Vercel → Project → Settings → Environment Variables):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | The Supabase project API URL |
| `SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable key (`sb_publishable_…`) |

**Email alerts (Resend).** After a submission is saved, `api/_notify.js` emails an alert through [Resend](https://resend.com): every new booking (reply goes straight to the client) and every new newsletter subscriber (duplicates don't alert). Alerts are best effort and capped at 5 seconds, so a failed email never loses a saved submission.

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key with send-only permission (stored as a Sensitive variable) |
| `NOTIFY_EMAIL` | Where alerts are sent |
| `RESEND_FROM` | Sender, e.g. `JRishiCPAs Website <onboarding@resend.dev>` |

Until a domain is verified in Resend, the `onboarding@resend.dev` sender can only deliver to the Resend account owner's address. After verifying your domain, set `RESEND_FROM` to an address on it (for example `JRishiCPAs <hello@yourdomain.ca>`); that also allows confirmation emails to clients and newsletters.

**Reading submissions.** Open the Supabase dashboard → Table Editor → `consultation_requests` (or `newsletter_subscribers`). Use the `status` column (`new`, `contacted`, `closed`) to track follow-ups.

## What's on the page

| Section | Notes |
| --- | --- |
| Top bar & header | Phone, email and client-portal link; sticky header with section highlighting; mobile menu |
| Hero | "I'm…" switcher (employee, self-employed, business owner, newcomer) that updates an example client file and links to matching services |
| Software we work with | Scrolling strip of accounting-software logos; pauses on hover, static with reduced motion |
| Services | Nine services in an explorer |
| Who we help | Six client situations, each linking to the services that fit |
| How it works | Four-step process |
| Tax Centre | CRA deadline countdown for the 2026 tax year and a personal/business document checklist |
| About & founder | Firm values and Jatin Rishi's founder profile |
| FAQ | Searchable accordion |
| Book a consultation | 3-step intake form, saved to Supabase |
| Newsletter | "The JRishiCPAs Brief" sign-up, saved to Supabase |

## Structure

```
index.html      All page sections
css/styles.css  Styles and responsive layout
js/main.js      Menu, hero switcher, service explorer, accordion, deadlines, checklist, forms
api/            Vercel Functions for the forms
vercel.json     Security headers
images/         Founder photo and software logos
```

## Before going live

- The address, phone number and email are placeholders (also `CONTACT_EMAIL` in `js/main.js`, used for the "Email us instead" fallback).
- Email alerts use Resend's test sender until you verify a domain in Resend (see Backend above).
- Point the "Client portal" links (`#portal`) at your practice-management portal.
- Update the CRA deadline list each tax year (`data-date` attributes in `index.html`).
