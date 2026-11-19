# NorthStarCPA — website

A responsive marketing website for **NorthStarCPA**, an online Canadian CPA firm. It is a static site with plain HTML, CSS and a little vanilla JavaScript: no build step and no dependencies apart from Google Fonts.

Live site (GitHub Pages): <https://jatinrishi5.github.io/Test/>

## Viewing the site

**Locally:** open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

**GitHub Pages:** the site is published from the `main` branch, `/ (root)` folder (Settings → Pages). Anything merged into `main` is republished automatically.

## What's on the page

| Section | Notes |
| --- | --- |
| Top bar & header | Phone, email and client-portal link on every screen; sticky header; mobile menu |
| Hero | Personal vs. business shortcuts, credibility stats |
| Services | Five services: personal tax, small business & corporate tax, bookkeeping & payroll, business set-up, advisory/CFO |
| How it works | Four-step process |
| Pricing | Personal (Basic / Standard / Comprehensive) and Business (Accountant / Controller / CFO) tabs; "Choose" pre-fills the booking form |
| Tax Centre | Key CRA deadlines for the 2026 tax year (next one highlighted automatically) and a personal/business document checklist |
| About & team | Firm values and placeholder team profiles |
| Reviews | Sample reviews (replace with verified Google reviews) |
| FAQ | Accordion with Canadian answers |
| Book a consultation | 3-step intake form with progress bar and a suggested package |
| Newsletter | "The Ledger Minute" sign-up |
| Mobile bar | Call / Book buttons fixed to the bottom on phones |

The design decisions follow the "Website examples" research tab in *Future Accounting Firm.xlsx* (e.g. booking CTA everywhere, personal/business split, intake form with progress bar, deadlines and checklists, newsletter instead of a blog, short FAQ answers, compact footer).

## Structure

```
index.html      All page sections
css/styles.css  Styles and responsive layout
js/main.js      Menu, tabs, accordion, deadlines, checklist, intake form, newsletter
```

## Before going live

- The firm name, people, reviews, prices, address, phone and email are placeholders.
- The intake and newsletter forms validate in the browser only and do not send data. Connect them to a form service, CRM or Calendly booking link.
- Point the "Client portal" links (`#portal`) at your practice-management portal.
- Update the CRA deadline list each tax year (`data-date` attributes in `index.html`).
- Replace the designation/software text badges with official partner badges you are entitled to use.
