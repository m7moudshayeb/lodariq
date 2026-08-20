#!/usr/bin/env python3
"""Insert new authoring catalogue entries into every non-English locale file."""
import json
import re
import sys
from pathlib import Path

ROOT = Path('/Users/mahmoudshayeb/Desktop/lodariq/packages/sdk-authoring/src/i18n-catalogs')

# entries[key][locale] = translation
ENTRIES = json.loads(Path(sys.argv[1]).read_text())

IDENT = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')


def js_key(key: str) -> str:
    return key if IDENT.match(key) else "'" + key.replace("'", "\\'") + "'"


def js_value(value: str) -> str:
    if "'" in value and '"' not in value:
        return '"' + value + '"'
    return "'" + value.replace("'", "\\'") + "'"


for path in sorted(ROOT.glob('*.ts')):
    locale = path.stem
    source = path.read_text()
    marker = '_CATALOG: AuthoringCatalog = {\n'
    index = source.index(marker) + len(marker)
    lines = []
    for key, byLocale in ENTRIES.items():
        if key in ('__comment',):
            continue
        translation = byLocale[locale]
        lines.append(f'  {js_key(key)}: {js_value(translation)},\n')
    path.write_text(source[:index] + ''.join(lines) + source[index:])
    print('updated', path.name, len(lines))
