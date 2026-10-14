#!/usr/bin/env python3
"""Block the known legacy GET -> expired force UPDATE before live B0 reads."""
import pathlib,re,sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.')
for source in (root/'apps/api/src').rglob('*.ts'):
    text=source.read_text()
    start=re.search(r'async function applyForceOverrides\b', text)
    if start:
        body=text[start.start():]
        end=re.search(r'\n(?:export )?(?:async )?function ',body[1:])
        if end: body=body[:end.start()+1]
        if re.search(r'\b(?:UPDATE|INSERT|DELETE)\b',body):
            raise SystemExit('BLOCKED: legacy applyForceOverrides still writes during GET; C0 must remove this side effect')
print('known GET write regression guard: PASS (not a full read-only proof)')
