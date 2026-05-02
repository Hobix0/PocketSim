from pathlib import Path
import re
from collections import Counter

text = Path('style.css').read_text(encoding='utf-8')
text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
selectors = []
blocks = []
i = 0
n = len(text)

while i < n:
    if text[i].isspace():
        i += 1
        continue
    if text[i] == '@':
        m = re.match(r'@[^\{;]+', text[i:])
        if not m:
            i += 1
            continue
        i += len(m.group(0))
        if i < n and text[i] == '{':
            lvl = 1
            i += 1
            while i < n and lvl > 0:
                if text[i] == '{':
                    lvl += 1
                elif text[i] == '}':
                    lvl -= 1
                i += 1
        else:
            while i < n and text[i] not in ';':
                i += 1
            if i < n and text[i] == ';':
                i += 1
        continue
    sel_start = i
    while i < n and text[i] != '{':
        i += 1
    if i >= n:
        break
    sel = text[sel_start:i].strip()
    if sel:
        block_start = i
        i += 1
        lvl = 1
        while i < n and lvl > 0:
            if text[i] == '{':
                lvl += 1
            elif text[i] == '}':
                lvl -= 1
            i += 1
        block = text[block_start:i]
        selectors.append(' '.join(' '.join(sel.split()).split(',')))
        blocks.append((sel, block))

cnt = Counter(selectors)
repeats = [(c,s) for s,c in cnt.items() if c > 1]
print(f'linecount {len(text.splitlines())}')
print(f'unique selectors {len(cnt)}')
print(f'duplicate selectors {len(repeats)}')
for c, s in sorted(repeats, reverse=True)[:80]:
    print(c, repr(s))

for sel in [s for c, s in repeats if c > 1][:20]:
    print('\n===', sel)
    for idx,(s,b) in enumerate(blocks):
        if ' '.join(' '.join(s.strip().split()).split(',')) == sel:
            print(f'-- block {idx}')
            print(s + b)
            print()
