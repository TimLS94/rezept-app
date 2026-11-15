# spoondrop.app

The public site: the privacy policy and support page that App Store Connect
requires, the Impressum that §5 DDG requires, and the file that makes shared
links open the app.

## Why it lives in the app's repository

`privacy.html` and `terms.html` are **generated from the app's own screens**
(`app/privacy.tsx`, `app/terms.tsx`) rather than written again here. Two copies
of a legal text drift, and the drift is invisible until somebody quotes the
wrong one back at you. Regenerate after changing either screen:

    python3 website/_generate.py

## The Team ID in the association file

`.well-known/apple-app-site-association` names the app as
`VUNC3SZN95.com.spoondrop.app`. The prefix is the Apple Team ID, so it is not
a constant: it belongs to whichever team owns the app, and an app transfer
changes it. Update it in the same sitting as the transfer, or shared links
quietly stop opening the app and nothing anywhere reports an error.

It shipped as the literal string `TEAMID` from 2026-08-30 until 2026-11-15,
with this section telling the reader to replace it. Nobody did, so no shared
link ever opened the app in that time. A placeholder that has to be noticed by
a human is a placeholder that stays.

## Deploying

Netlify, with **base directory `website`** and no build command. Custom domain
`spoondrop.app`; HTTPS is not optional on a `.app` domain, it is on the HSTS
preload list.

Netlify serves `privacy.html` at `/privacy` on its own. The `_headers` file is
what makes the association file arrive as JSON — GitHub Pages cannot set
headers, which is why it is not used here.
