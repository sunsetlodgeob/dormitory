#!/usr/bin/env python3
"""index.html と css/js を 1 枚の HTML 断片にまとめる（claude.ai の Artifact 公開用）。

使い方: python3 tools/build_artifact.py [出力先パス]   （省略時は dist/sekisho-dorm.html）

Artifact は公開時に <!doctype>・<head>・<body> を自動で付けるので、
ここではそれらを外し、ローカルの CSS と JS を中に埋め込みます。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "sekisho-dorm.html"
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)

    keep = []
    for line in head.strip().splitlines():
        line = line.strip()
        if line.startswith("<meta"):
            continue  # charset と viewport は公開時に付く
        m = re.match(r'<link rel="stylesheet" href="(?!https?:)([^"]+)">', line)
        if m:
            css = (ROOT / m.group(1)).read_text(encoding="utf-8")
            keep.append("<style>\n" + css.strip() + "\n</style>")
            continue
        keep.append(line)

    def inline_js(m: "re.Match[str]") -> str:
        js = (ROOT / m.group(1)).read_text(encoding="utf-8")
        if "</script" in js:
            raise SystemExit(m.group(1) + " に </script が含まれています")
        return "<script>\n" + js.strip() + "\n</script>"

    body = re.sub(r'<script src="(?!https?:)([^"]+)"></script>', inline_js, body)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(keep) + "\n" + body.strip() + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
