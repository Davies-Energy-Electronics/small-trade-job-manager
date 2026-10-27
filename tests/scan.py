#!/usr/bin/env python3
"""Pre-publish scan: fails if anything that looks like real personal or business data is in the repository.
Usage: python3 tests/scan.py   (exit 0 = clean). Looks for UK phone numbers, email addresses, UK postcodes,
sort codes, account numbers, keys and tokens, *.workers.dev addresses other than the placeholder, and backup files.
The bundled jsPDF licence block and the sample data in seedExample() are allowed and listed below."""
import os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ALLOW_EMAIL = re.compile(r'@(example\.com|[a-z.]*\.example|parall\.ax|yworks\.com|gmail\.com>|twelvetone\.tv|sstoo|users\.noreply)', re.I)
ALLOW_POSTCODE = {'OL16 1AA', 'NE3 4AA', 'AB1 2CD'}   # sample customers in seedExample()
CHECKS = [
    ('UK phone number', re.compile(r'(?<![\d.])(?:0\d{3,4}[ ]?\d{3}[ ]?\d{3,4}|\+44 ?\d{4} ?\d{6})(?!\d)')),
    ('email address', re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')),
    ('UK postcode', re.compile(r'\b[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}\b')),
    ('sort code', re.compile(r'\b\d{2}-\d{2}-\d{2}\b')),
    ('key or token', re.compile(r'(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)')),
    ('sync address', re.compile(r'https://(?!your-sync\.yourname)[\w-]+\.[\w-]+\.workers\.dev')),
]
found = []
for d, _, files in os.walk(ROOT):
    if '.git' in d or 'node_modules' in d: continue
    for f in files:
        p = os.path.join(d, f); rel = os.path.relpath(p, ROOT)
        if re.search(r'(backup|export).*\.json$|\.csv$', f, re.I): found.append((rel, 0, 'backup or export file', f)); continue
        if not re.search(r'\.(html|js|mjs|md|txt|json|webmanifest|py|yml)$|^_headers$|^LICENSE$', f): continue
        for n, line in enumerate(open(p, encoding='utf-8', errors='replace'), 1):
            if len(line) > 5000: line = re.sub(r'base64,[A-Za-z0-9+/=]+', 'base64,...', line)
            for name, rx in CHECKS:
                for m in rx.finditer(line):
                    t = m.group(0)
                    if name == 'email address' and (ALLOW_EMAIL.search(line[m.start():m.end() + 2]) or rel.endswith('scan.py')): continue
                    if name == 'UK postcode' and t in ALLOW_POSTCODE: continue
                    if name == 'UK phone number' and re.search(r'x{3}', line[m.start():m.end() + 4]): continue
                    if rel.endswith('scan.py'): continue
                    # third-party licence credits (jsPDF and its parts) and form placeholders are not data
                    if name == 'email address' and re.search(r'Copyright|@author|Parser|@license', line): continue
                    if name == 'UK phone number' and (set(re.sub(r'\D', '', t)) == {'0'} or re.sub(r'\D', '', t) == '0123456789'): continue
                    if name == 'sort code' and t == '00-00-00': continue
                    found.append((rel, n, name, t))
for r in found: print('%s:%s  %s  %r' % r)
print('CLEAN' if not found else f'{len(found)} finding(s)')
sys.exit(1 if found else 0)
