#!/usr/bin/env python3
"""Rebuild the site's legal pages from the app's own screens.

The privacy policy and terms exist twice — a screen in the app and a page on
the site — and they have to say the same thing. Writing them twice guarantees
they will not, and the drift stays invisible until somebody quotes the wrong
one back at you.

    python3 website/_generate.py
"""
import html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

NAV = """<header class="site">
  <a class="mark" href="/">SPOON<span>DROP</span></a>
  <nav>
    <a href="/support">Support</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/imprint">Legal notice</a>
  </nav>
</header>"""

FOOT = """<footer class="site">
  <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/imprint">Legal notice</a><a href="/support">Support</a>
  <p>© 2026 Tim Schäfer · Berlin, Germany</p>
</footer>"""


def page(slug, title, desc, body):
    open(os.path.join(HERE, slug), "w").write(f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · SpoonDrop</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title} · SpoonDrop">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/style.css">
</head><body><div class="wrap">
{NAV}
{body}
{FOOT}
</div></body></html>
""")
    print("  wrote", slug)


def extract(path):
    """Pull the styled Text blocks out of a legal screen, in order."""
    src = open(path).read()
    body = src[src.index("<ScrollView"):src.index("const styles")]
    out = []
    for m in re.finditer(
        r"<Text style=\{styles\.(sectionTitle|subTitle|paragraph|lastUpdated)\}>(.*?)</Text>",
        body, re.S):
        kind, t = m.group(1), m.group(2)
        t = t.replace("{'\\n\\n'}", "\n\n").replace("{'\\n'}", "\n").replace("{' '}", " ")
        t = re.sub(r"<Text[^>]*>", "", t).replace("</Text>", "")
        t = re.sub(r"\{[^{}]*\}", "", t)
        t = html.escape(re.sub(r"[ \t]+", " ", t).strip())
        if t:
            out.append((kind, t))
    return out


def to_html(items):
    parts = []
    for kind, t in items:
        if kind == "lastUpdated":
            parts.append(f'<p class="updated">{t}</p>')
        elif kind == "sectionTitle":
            parts.append(f"<h2>{t}</h2>")
        elif kind == "subTitle":
            parts.append(f'<h3 style="font-size:15px;margin:18px 0 6px">{t}</h3>')
        else:
            parts.append("<p>" + t.replace("\n\n", "</p><p>").replace("\n", "<br>") + "</p>")
    return "\n".join(parts)


if __name__ == "__main__":
    for src, slug, title, desc in [
        (f"{APP}/app/privacy.tsx", "privacy.html", "Privacy Policy",
         "How SpoonDrop collects, uses and protects your information."),
        (f"{APP}/app/terms.tsx", "terms.html", "Terms of Service",
         "The terms you agree to when using SpoonDrop."),
    ]:
        page(slug, title, desc, f"<h1>{title}</h1>\n" + to_html(extract(src)))
    print("index, support and imprint are hand-written — edit them directly.")
