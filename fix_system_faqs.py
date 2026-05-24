import re
import os

os.chdir(r'C:\Users\mialo\tmi-landing-1')

system_pages = sorted([f for f in os.listdir('.') if f.startswith('system-') and f.endswith('.html')])

FAQ_CSS = """
  .faq-section { padding: 96px 0; border-top: 1px solid var(--line); }
  .faq-section .faq-eyebrow { font-family: var(--sans); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; }
  .faq-section h2 { margin-bottom: 56px; }
  .faq-item { border-top: 1px solid var(--line); padding: 28px 0; max-width: 760px; }
  .faq-item:last-child { border-bottom: 1px solid var(--line); }
  .faq-q { font-family: var(--serif); font-size: clamp(18px, 1.6vw, 22px); font-weight: 400; letter-spacing: -0.01em; line-height: 1.3; color: var(--ink); margin: 0 0 14px; }
  .faq-a { font-family: var(--sans); font-size: 15px; line-height: 1.7; color: var(--ink-2); margin: 0; }
"""

def extract_faqs(content):
    # Find FAQPage JSON-LD block
    faq_match = re.search(
        r'<script type="application/ld\+json">\s*(\{[^<]*?"@type"\s*:\s*"FAQPage"[^<]*?\})\s*</script>',
        content, re.DOTALL
    )
    if not faq_match:
        return []

    faq_json = faq_match.group(1)
    qa_pairs = []

    # Extract each Question block - handles both single and double quote delimiters
    # Pattern: "name":(quote)(content)(same_quote) ... "text":(quote)(content)(same_quote)}
    for q_match in re.finditer(
        r'"name"\s*:\s*(["\'])(.+?)\1.*?"text"\s*:\s*(["\'])(.+?)\3\s*\}',
        faq_json, re.DOTALL
    ):
        name = q_match.group(2).strip()
        text = q_match.group(4).strip()
        if name and text:
            qa_pairs.append((name, text))

    return qa_pairs

def build_faq_section(qa_pairs):
    items = []
    for q, a in qa_pairs:
        items.append(f'''    <div class="faq-item reveal">
      <h3 class="faq-q">{q}</h3>
      <p class="faq-a">{a}</p>
    </div>''')

    return '\n<section class="faq-section">\n  <div class="container">\n    <p class="faq-eyebrow">FAQ</p>\n    <h2>Common Questions</h2>\n' + '\n'.join(items) + '\n  </div>\n</section>\n\n'

count = 0
for filename in system_pages:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already has visible FAQ
    if 'faq-section' in content:
        print(f"Already has FAQ: {filename}")
        continue

    qa_pairs = extract_faqs(content)
    if not qa_pairs:
        print(f"No FAQ extracted: {filename}")
        continue

    faq_html = build_faq_section(qa_pairs)

    # Add CSS to style block (before closing </style>)
    if '.faq-section' not in content:
        content = content.replace('</style>', FAQ_CSS + '</style>', 1)

    # Insert before footer
    footer_match = re.search(r'<footer', content)
    if footer_match:
        pos = footer_match.start()
        content = content[:pos] + faq_html + content[pos:]
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
        print(f"Fixed ({len(qa_pairs)} FAQs): {filename}")
    else:
        print(f"No footer found: {filename}")

print(f"\nTotal system pages fixed: {count}")
