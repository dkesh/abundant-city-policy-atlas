# abundant-city-policy-atlas
A tool to show a meta-map combining reform maps from other sources.

## Admin interface

A password-protected admin UI at `/admin` lets you review flagged bill submissions (review queue). It is not linked from the main app.

- **Set `ADMIN_PASSWORD`** in Netlify (Site settings → Environment variables) or in `.env` for local `netlify dev`.
- Open `https://yoursite.com/admin` (or `http://localhost:8888/admin`), enter the password, then approve or reject queue items.
- Log out clears the session cookie. 
