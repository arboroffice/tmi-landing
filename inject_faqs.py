import re
import os

BASE = r"C:\Users\mialo\tmi-landing-1"

FILES = [
    "article-15-billion.html",
    "article-ai-tools-field-service.html",
    "article-budget-overruns.html",
    "article-change-orders.html",
    "article-crew-accountability.html",
    "article-crew-ignores-apps.html",
    "article-equipment-lost.html",
    "article-expensive-dispatcher.html",
    "article-how-construction-ai.html",
    "article-idle-time.html",
    "article-job-costing.html",
    "article-labor-shortage.html",
    "article-missed-maintenance.html",
    "article-one-molly.html",
    "article-paperless-offline.html",
    "article-pricing-accuracy.html",
    "article-state-of-ai-trades-2026.html",
]

FAQ_PATTERN = re.compile(
    r'"@type"\s*:\s*"Question",\s*"name"\s*:\s*"([^"]+)".*?"@type"\s*:\s*"Answer",\s*"text"\s*:\s*"([^"]+)"',
    re.DOTALL
)

results = []

for filename in FILES:
    path = os.path.join(BASE, filename)
    if not os.path.exists(path):
        results.append(f"MISSING: {filename}")
        continue

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Check if FAQ HTML already injected
    if 'class="article-faq"' in content and '<div class="faq-item">' in content:
        results.append(f"ALREADY_DONE: {filename}")
        continue

    # Extract Q&As from JSON-LD
    pairs = FAQ_PATTERN.findall(content)
    if not pairs:
        results.append(f"NO_QAS_FOUND: {filename}")
        continue

    # Build FAQ HTML
    faq_items = ""
    for q, a in pairs:
        faq_items += f'    <div class="faq-item">\n      <div class="faq-q">{q}</div>\n      <div class="faq-a">{a}</div>\n    </div>\n'

    faq_html = (
        '\n<div class="container-article">\n'
        '  <div class="article-faq">\n'
        '    <h2 class="faq-heading">Common Questions</h2>\n'
        + faq_items +
        '  </div>\n'
        '</div>\n'
    )

    # Find first occurrence of <div class="read-next">
    insert_marker = '<div class="read-next">'
    idx = content.find(insert_marker)
    if idx == -1:
        results.append(f"NO_READ_NEXT: {filename}")
        continue

    new_content = content[:idx] + faq_html + content[idx:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)

    results.append(f"OK ({len(pairs)} Q&As): {filename}")

print("\n".join(results))
