# Turns an artifact page (no doctype/head) into a standalone HTML document.
import sys, re
src, dst, lang = sys.argv[1], sys.argv[2], 'en'
s = open(src).read()
s = s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
i = s.index('<div id="stage"')
head, body = s[:i].rstrip() + '\n', s[i:]
out = f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head}<style>
  body {{ margin: 0; }}
  [hidden] {{ display: none !important; }}
</style>
</head>
<body>
{body.rstrip()}
</body>
</html>
'''
open(dst, 'w').write(out)
