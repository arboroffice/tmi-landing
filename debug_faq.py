import re

with open('article-roofing.html', 'r', encoding='utf-8') as f:
    content = f.read()

faq_match = re.search(r'<script type="application/ld\+json">\s*(\{[^<]*?"@type"\s*:\s*"FAQPage"[^<]*?\})\s*</script>', content, re.DOTALL)
if faq_match:
    faq_json = faq_match.group(1)
    print('FAQPage found, length:', len(faq_json))
    print('First 300 chars:', repr(faq_json[:300]))
    print()

    # Try simpler extraction
    names = re.findall(r'"name"\s*:\s*["\']([^"\']+)["\']', faq_json)
    print('Names found:', names)

    texts = re.findall(r'"text"\s*:\s*["\']([^"\']+)["\']', faq_json)
    print('Texts found:', len(texts))
else:
    print('No FAQPage block - checking structure')
    idx = content.find('FAQPage')
    print('FAQPage at:', idx)
    if idx > 0:
        print(repr(content[idx-50:idx+100]))
