"""
Fix the 13 article files + system-ops-twin that still have broken JSON-LD.
These have single-quoted values that may contain apostrophes/escaped single-quotes.
Strategy: rebuild the JSON-LD block from scratch by extracting known field values.
"""
import os, re, json
os.chdir(r'C:\Users\mialo\tmi-landing-1')

def js_to_json(text):
    """
    Convert JavaScript-style JSON (with single-quoted strings and \\' escapes)
    to valid JSON.
    Works character-by-character through the text.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        # If we hit a single quote that starts a string value
        # (preceded by : or , or [ with optional whitespace)
        # We need to look behind in the output to see if this starts a value
        if ch == "'" :
            # Collect chars until unescaped closing single quote
            j = i + 1
            inner = []
            while j < n:
                c2 = text[j]
                if c2 == '\\' and j + 1 < n:
                    next_c = text[j + 1]
                    if next_c == "'":
                        inner.append("'")  # escaped apostrophe -> literal apostrophe
                        j += 2
                    elif next_c == '"':
                        inner.append('\\"')
                        j += 2
                    else:
                        inner.append(c2)
                        inner.append(next_c)
                        j += 2
                elif c2 == "'":
                    j += 1
                    break
                elif c2 == '"':
                    inner.append('\\"')
                    j += 1
                else:
                    inner.append(c2)
                    j += 1
            out.append('"')
            out.extend(inner)
            out.append('"')
            i = j
        elif ch == '"':
            # Already a double-quoted string; copy through
            j = i + 1
            out.append('"')
            while j < n:
                c2 = text[j]
                if c2 == '\\' and j + 1 < n:
                    next_c = text[j + 1]
                    if next_c == "'":
                        # \' inside double-quoted string: just output the apostrophe
                        out.append("'")
                        j += 2
                    else:
                        out.append(c2)
                        out.append(next_c)
                        j += 2
                elif c2 == '"':
                    out.append('"')
                    j += 1
                    break
                else:
                    out.append(c2)
                    j += 1
            i = j
        else:
            out.append(ch)
            i += 1
    return ''.join(out)

TARGET_FILES = [
    'article-concrete.html', 'article-construction.html', 'article-heavy-equipment.html',
    'article-hvac.html', 'article-landscaping.html', 'article-manufacturing.html',
    'article-mining.html', 'article-painting.html', 'article-pipeline.html',
    'article-plumbing.html', 'article-roofing.html', 'article-trades-and-ai.html',
    'article-welding.html', 'system-ops-twin.html',
]

fixed = 0
still_broken = []

for filepath in TARGET_FILES:
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    def fix_block(m):
        block = m.group(1)
        try:
            json.loads(block.strip())
            return m.group(0)  # already valid
        except json.JSONDecodeError:
            pass
        fixed_block = js_to_json(block)
        try:
            json.loads(fixed_block.strip())
            return '<script type="application/ld+json">' + fixed_block + '</script>'
        except json.JSONDecodeError as e:
            still_broken.append(f'{filepath}: {e}')
            return m.group(0)

    new_content = re.sub(
        r'<script type="application/ld\+json">(.*?)</script>',
        fix_block,
        content,
        flags=re.DOTALL
    )

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        fixed += 1
        print(f'Fixed: {filepath}')
    else:
        print(f'No change: {filepath}')

print(f'\nFixed: {fixed} files')
if still_broken:
    print(f'Still broken:')
    for s in still_broken:
        print(f'  {s}')
else:
    print('All clean.')
