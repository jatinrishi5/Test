# Ledgerline Accounting — website

A responsive marketing website for **Ledgerline Accounting**, a fictional accounting firm. It is a static site with plain HTML, CSS and a little vanilla JavaScript: no build step and no dependencies apart from Google Fonts.

## Viewing the site

**Locally:** open `index.html` in any modern browser. You can also serve the folder with a simple local server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

**GitHub Pages:** in the repository, go to **Settings → Pages**, set the source to **Deploy from a branch**, choose the default branch and the `/ (root)` folder, and save. The site will be published at `https://<username>.github.io/<repository>/`.

## Structure

```
index.html      All page sections (header, hero, services, about, team,
                testimonials, pricing, FAQ, contact, footer)
css/styles.css  Styles and responsive layout
js/main.js      Mobile menu, FAQ accordion, contact form validation
```

## Notes

- The firm, people, testimonials, prices, address, phone and email are placeholders.
- The contact form validates input in the browser and shows a success message. It does not send data anywhere. Connect it to a form service or backend before using it for real.
- Accessibility: semantic landmarks, skip link, keyboard-operable menu (Esc closes it) and accordion (arrow keys move between questions), visible focus styles, and WCAG AA colour contrast.
