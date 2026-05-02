from pathlib import Path
import re
from collections import Counter

text = Path('style.css').read_text(encoding='utf-8')
text_nocomment = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
selectors = []
blocks = []
line_map = []
line = 1
for ch in text_nocomment:
    line_map.append(line)
    if ch == '\n':
        line += 1

i = 0
n = len(text_nocomment)
while i < n:
    if text_nocomment[i].isspace():
        i += 1
        continue
    if text_nocomment[i] == '@':
        m = re.match(r'@[^\{;]+', text_nocomment[i:])
        if not m:
            i += 1
            continue
        i += len(m.group(0))
        if i < n and text_nocomment[i] == '{':
            lvl = 1
            i += 1
            while i < n and lvl > 0:
                if text_nocomment[i] == '{':
                    lvl += 1
                elif text_nocomment[i] == '}':
                    lvl -= 1
                i += 1
        else:
            while i < n and text_nocomment[i] not in ';':
                i += 1
            if i < n and text_nocomment[i] == ';':
                i += 1
        continue
    sel_start = i
    while i < n and text_nocomment[i] != '{':
        i += 1
    if i >= n:
        break
    sel = text_nocomment[sel_start:i].strip()
    if sel:
        block_start = i
        start_line = line_map[sel_start]
        i += 1
        lvl = 1
        while i < n and lvl > 0:
            if text_nocomment[i] == '{':
                lvl += 1
            elif text_nocomment[i] == '}':
                lvl -= 1
            i += 1
        block = text_nocomment[block_start:i]
        selectors.append(' '.join(' '.join(sel.split()).split(',')))
        blocks.append((sel, block, start_line))

cnt = Counter(selectors)
repeats = [sel for sel, c in cnt.items() if c > 1]
for sel in repeats:
    print('===', sel)
    for idx, (s, b, line_no) in enumerate(blocks):
        if ' '.join(' '.join(s.strip().split()).split(',')) == sel:
            print(f'-- block {idx} @ line {line_no}')
