from pathlib import Path
import re
from collections import defaultdict

text = Path('style.css').read_text(encoding='utf-8')
text_no = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
entries = []

i = 0
n = len(text_no)
while i < n:
    if text_no[i].isspace():
        i += 1
        continue
    if text_no[i] == '@':
        m = re.match(r'@[^\{;]+', text_no[i:])
        if not m:
            i += 1
            continue
        i += len(m.group(0))
        if i < n and text_no[i] == '{':
            lvl = 1
            i += 1
            while i < n and lvl > 0:
                if text_no[i] == '{':
                    lvl += 1
                elif text_no[i] == '}':
                    lvl -= 1
                i += 1
        else:
            while i < n and text_no[i] not in ';':
                i += 1
            if i < n and text_no[i] == ';':
                i += 1
        continue
    sel_start = i
    while i < n and text_no[i] != '{':
        i += 1
    if i >= n:
        break
    sel = text_no[sel_start:i].strip()
    if sel:
        block_start = i
        i += 1
        lvl = 1
        while i < n and lvl > 0:
            if text_no[i] == '{':
                lvl += 1
            elif text_no[i] == '}':
                lvl -= 1
            i += 1
        block = text_no[block_start:i]
        norm = ' '.join(' '.join(sel.split()).split(','))
        entries.append((norm, block.strip(), sel_start))

by_sel = defaultdict(list)
for sel, block, pos in entries:
    by_sel[sel].append((block, pos))

for sel, blocks in by_sel.items():
    if len(blocks) > 1:
        unique_blocks = set(b for b,_ in blocks)
        if len(unique_blocks) == 1:
            print('IDENTICAL', sel, len(blocks), 'occurrences')
        else:
            print('DIFFERENT', sel, len(blocks), 'occurrences')
            for block, pos in blocks:
                print('  pos', pos, 'len', len(block), 'firstline', block.splitlines()[0])
