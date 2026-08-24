#!/usr/bin/env python3
"""Remove stale catalogue entries. Entry-aware: a value can wrap onto its own line."""
import re, sys
from pathlib import Path

ROOT = Path('/Users/mahmoudshayeb/Desktop/lodariq/packages/sdk-authoring/src/i18n-catalogs')
STALE = [line.rstrip('\n') for line in Path(sys.argv[1]).read_text().splitlines() if line.strip()]

def key_variants(key: str):
    """The two forms add-i18n.py can have written the key in."""
    ident = re.match(r'^[A-Za-z_$][A-Za-z0-9_$]*$', key)
    if ident:
        return [key + ':']
    return ["'" + key.replace("'", "\\'") + "':", '"' + key + '":']

for path in sorted(ROOT.glob('*.ts')):
    text = path.read_text()
    lines = text.split('\n')
    removed = 0
    for key in STALE:
        variants = key_variants(key)
        i = 0
        while i < len(lines):
            stripped = lines[i].lstrip()
            if any(stripped.startswith(v) for v in variants):
                # The entry runs until the line that closes it with a comma.
                j = i
                while j < len(lines) and not lines[j].rstrip().endswith(','):
                    j += 1
                del lines[i:j + 1]
                removed += 1
                break
            i += 1
    path.write_text('\n'.join(lines))
    print('stripped', path.name, removed)
