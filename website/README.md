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

## Before this works

`.well-known/apple-app-site-association` contains `TEAMID.com.spoondrop.app`.
Replace `TEAMID` with the real Apple Team ID — Apple Developer → Membership.
Until then universal links do nothing; the site itself is unaffected.

## Deploying

Netlify, with **base directory `website`** and no build command. Custom domain
`spoondrop.app`; HTTPS is not optional on a `.app` domain, it is on the HSTS
preload list.

Netlify serves `privacy.html` at `/privacy` on its own. The `_headers` file is
what makes the association file arrive as JSON — GitHub Pages cannot set
headers, which is why it is not used here.
