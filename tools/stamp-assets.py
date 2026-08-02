#!/usr/bin/env python3
"""Stamp styles.css and app.js in index.html with their modification time.

Browsers cache both files hard, so a deploy can leave visitors on the old
stylesheet and the old script for days. Appending ?v=<timestamp> makes the
URL change whenever the file does, which is the one thing a cache cannot
ignore.

The stamp is the mtime of the newest of the two files, not the date of the
last commit: run as a pre-commit hook, the last commit is the *previous*
one, so the stamp would not move on the very edit that needs it to.

    python3 tools/stamp-assets.py           rewrite index.html
    python3 tools/stamp-assets.py --check   exit 1 if it is out of date

Wire it in so it can never be forgotten:

    ln -s ../../tools/stamp-assets.py .git/hooks/pre-commit
"""

import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
ASSETS = ("styles.css", "app.js")

# href="styles.css" / src="app.js", with or without an existing ?v=…
PATTERN = re.compile(
    r'((?:href|src)=")(' + "|".join(re.escape(a) for a in ASSETS) + r')(\?v=[^"]*)?(")'
)


def stamp() -> str:
    newest = max((ROOT / name).stat().st_mtime for name in ASSETS)
    return time.strftime("%Y%m%d-%H%M", time.localtime(newest))


def rewrite(html: str, token: str) -> str:
    return PATTERN.sub(lambda m: f"{m[1]}{m[2]}?v={token}{m[4]}", html)


def main() -> int:
    for name in ASSETS:
        if not (ROOT / name).exists():
            print(f"stamp-assets: {name} is missing", file=sys.stderr)
            return 1

    token = stamp()
    before = PAGE.read_text(encoding="utf-8")
    after = rewrite(before, token)

    if "--check" in sys.argv:
        if before != after:
            print(f"stamp-assets: index.html is stale, expected ?v={token}")
            return 1
        print(f"stamp-assets: up to date (?v={token})")
        return 0

    if before == after:
        print(f"stamp-assets: already at ?v={token}")
        return 0

    PAGE.write_text(after, encoding="utf-8")
    print(f"stamp-assets: index.html stamped ?v={token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
