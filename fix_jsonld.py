"""
Fix broken JSON-LD blocks across 38 files:
- 13 article-*.html: contain \' escape sequences inside JSON strings (invalid JSON)
- 25 system-*.html: use single-quote string delimiters instead of double-quote
"""
import os, re, json
os.chdir(r'C:\Users\mialo\tmi-landing-1')

def try_parse(block):
    try:
        json.loads(block.strip())
        return True
    except json.JSONDecodeError:
        return False

def fix_article_block(block):
    """Articles: \' inside double-quoted JSON strings is invalid. Strip the backslash."""
    # \' inside a JSON string should just be ' (apostrophe doesn't need escaping in JSON)
    fixed = block.replace("\\'", "'")
    # Also fix any single-quote delimited values: :'value' or :'value',
    # Pattern: ": followed by ' ... ' (single-quoted string value)
    # We need to convert 'value' -> "value" but only when used as JSON string delimiters
    # Do this carefully: replace ': 'value' or ':'value' patterns
    def replace_single_quoted_value(m):
        inner = m.group(1)
        # Escape any double quotes inside the value
        inner = inner.replace('"', '\\"')
        return ': "' + inner + '"'
    fixed = re.sub(r":\s*'([^']*)'", replace_single_quoted_value, fixed)
    return fixed

def fix_system_block(block):
    """System pages: entire string values use single quotes as delimiters."""
    # Replace all :'value' and ,"key":'value' patterns
    # Strategy: find all 'value' occurrences that are JSON string values
    # and convert them to "value"
    fixed = block

    # First handle \'escapes
    fixed = fixed.replace("\\'", "'")

    # Convert single-quoted values: : 'value' -> : "value"
    # Handle both :"value" (already OK) and :'value' (needs fixing)
    def sq_to_dq(m):
        inner = m.group(1)
        inner = inner.replace('"', '\\"')
        return ': "' + inner + '"'
    fixed = re.sub(r":\s*'([^']*)'", sq_to_dq, fixed)

    return fixed

files_fixed = 0
blocks_fixed = 0

TARGET_FILES = [
    'article-concrete.html', 'article-construction.html', 'article-heavy-equipment.html',
    'article-hvac.html', 'article-landscaping.html', 'article-manufacturing.html',
    'article-mining.html', 'article-painting.html', 'article-pipeline.html',
    'article-plumbing.html', 'article-roofing.html', 'article-trades-and-ai.html',
    'article-welding.html',
]
SYSTEM_FILES = [f for f in os.listdir('.') if f.startswith('system-') and f.endswith('.html')]

def process_file(filepath, fix_fn):
    global files_fixed, blocks_fixed
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    def fix_block(m):
        global blocks_fixed
        block = m.group(1)
        if try_parse(block):
            return m.group(0)  # already valid
        fixed = fix_fn(block)
        if try_parse(fixed):
            blocks_fixed += 1
            return '<script type="application/ld+json">' + fixed + '</script>'
        # Last resort: try stripping all backslashes before quotes
        fixed2 = re.sub(r"\\(['\"])", r'\1', block)
        fixed2 = re.sub(r":\s*'([^']*)'", lambda mm: ': "' + mm.group(1).replace('"', '\\"') + '"', fixed2)
        if try_parse(fixed2):
            blocks_fixed += 1
            return '<script type="application/ld+json">' + fixed2 + '</script>'
        print(f'  STILL BROKEN after fix attempt: {filepath}')
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
        files_fixed += 1
        print(f'Fixed: {filepath}')

for f in TARGET_FILES:
    process_file(f, fix_article_block)

for f in sorted(SYSTEM_FILES):
    process_file(f, fix_system_block)

print(f'\nTotal: {files_fixed} files fixed, {blocks_fixed} JSON-LD blocks corrected')

# Verify
still_broken = []
for f in TARGET_FILES + SYSTEM_FILES:
    c = open(f, encoding='utf-8', errors='ignore').read()
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', c, re.DOTALL)
    for i, b in enumerate(blocks):
        try:
            json.loads(b.strip())
        except json.JSONDecodeError as e:
            still_broken.append(f'{f} block {i+1}: {e}')

if still_broken:
    print(f'\nStill broken ({len(still_broken)}):')
    for s in still_broken: print(f'  {s}')
else:
    print('\nAll blocks now parse cleanly.')
