"""
Add FAQPage JSON-LD to 7 physical pages that have n-faq-q/n-faq-a-body accordion FAQs
but no FAQPage schema. Also add Service schema if missing.
"""
import re, os
os.chdir(r'C:\Users\mialo\tmi-landing-1')

PAGES = [
    'physical/dental.html',
    'physical/fitness.html',
    'physical/healthcare.html',
    'physical/heavy-machinery.html',
    'physical/home-service.html',
    'physical/legal.html',
    'physical/real-estate.html',
]

def extract_nfaq(content):
    """Extract Q&As from n-faq-q / n-faq-a-body accordion HTML."""
    pairs = []
    # Pattern: button.n-faq-q text, then div.n-faq-a > p.n-faq-a-body text
    for m in re.finditer(
        r'class="n-faq-q"[^>]*>(.*?)<span',
        content, re.DOTALL
    ):
        q = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        # Find the answer that follows this question
        pos = m.end()
        a_match = re.search(r'class="n-faq-a-body"[^>]*>(.*?)</p>', content[pos:pos+2000], re.DOTALL)
        if a_match:
            a = re.sub(r'<[^>]+>', '', a_match.group(1)).strip()
            if q and a:
                pairs.append((q, a))
    return pairs

def json_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def build_faqpage_jsonld(pairs, url):
    entities = []
    for q, a in pairs:
        entities.append(
            '{"@type":"Question","name":' + json_str(q) + ',"acceptedAnswer":{"@type":"Answer","text":' + json_str(a) + '}}'
        )
    return (
        '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[' +
        ','.join(entities) +
        ']}'
    )

count = 0
for filepath in PAGES:
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    if re.search(r'"@type"\s*:\s*"FAQPage"', content):
        print(f'Already has FAQPage: {filepath}')
        continue

    pairs = extract_nfaq(content)
    if not pairs:
        print(f'No n-faq content found: {filepath}')
        continue

    # Get canonical URL for this page
    canon_match = re.search(r'rel="canonical" href="([^"]+)"', content)
    url = canon_match.group(1) if canon_match else ''

    schema = '<script type="application/ld+json">\n' + build_faqpage_jsonld(pairs, url) + '\n</script>\n'

    # Insert after last existing ld+json block, or before </head>
    last_schema_end = 0
    for m in re.finditer(r'</script>\n', content):
        if content[m.start()-50:m.start()].count('ld+json') or content[:m.start()].rfind('application/ld+json') > last_schema_end:
            last_schema_end = m.end()

    if last_schema_end > 0:
        content = content[:last_schema_end] + schema + content[last_schema_end:]
    else:
        content = content.replace('</head>', schema + '</head>', 1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    count += 1
    print(f'Added FAQPage ({len(pairs)} Q&As): {filepath}')

print(f'\nTotal fixed: {count}')
