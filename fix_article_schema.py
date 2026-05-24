import os
import re
import json

base_dir = os.path.dirname(os.path.abspath(__file__))

articles = [
    "article-ai-tools-field-service.html",
    "article-backlog-cash-timing.html",
    "article-best-ai-hvac-software.html",
    "article-how-construction-ai.html",
    "article-online-launch-burnout.html",
    "article-online-lead-followup.html",
    "article-power-ai-projects-crew-safety.html",
    "article-state-of-ai-trades-2026.html",
]

skipped = []
updated = []
errors = []

for fname in articles:
    fpath = os.path.join(base_dir, fname)
    if not os.path.exists(fpath):
        print(f"ERROR: File not found: {fname}")
        errors.append(fname)
        continue

    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Check if Article schema already exists
    if '"@type":"Article"' in content or '"@type": "Article"' in content:
        print(f"SKIP (already has Article schema): {fname}")
        skipped.append(fname)
        continue

    # Extract title
    title_match = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE)
    if not title_match:
        print(f"ERROR: No title found in {fname}")
        errors.append(fname)
        continue
    title = title_match.group(1).strip()
    # Strip " | TMI" suffix
    title = re.sub(r'\s*\|\s*TMI\s*$', '', title).strip()

    # Extract meta description
    desc_match = re.search(r'<meta name="description" content="([^"]*)"', content, re.IGNORECASE)
    if not desc_match:
        desc_match = re.search(r"<meta name='description' content='([^']*)'", content, re.IGNORECASE)
    if not desc_match:
        print(f"WARNING: No meta description in {fname}, using empty string")
        description = ""
    else:
        description = desc_match.group(1).strip()

    # Extract canonical URL
    canonical_match = re.search(r'<link rel="canonical" href="([^"]*)"', content, re.IGNORECASE)
    if not canonical_match:
        canonical_match = re.search(r"<link rel='canonical' href='([^']*)'", content, re.IGNORECASE)
    if not canonical_match:
        print(f"ERROR: No canonical found in {fname}")
        errors.append(fname)
        continue
    canonical = canonical_match.group(1).strip()

    # Extract og:image
    image_match = re.search(r'<meta property="og:image" content="([^"]*)"', content, re.IGNORECASE)
    if not image_match:
        image_match = re.search(r"<meta property='og:image' content='([^']*)'", content, re.IGNORECASE)
    if not image_match:
        print(f"WARNING: No og:image in {fname}, using empty string")
        image = ""
    else:
        image = image_match.group(1).strip()

    # Build JSON-LD
    schema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": description,
        "url": canonical,
        "image": image,
        "author": {
            "@type": "Organization",
            "name": "TMI Technology",
            "url": "https://www.tmitechai.com"
        },
        "publisher": {
            "@type": "Organization",
            "name": "TMI Technology",
            "url": "https://www.tmitechai.com"
        }
    }
    schema_json = json.dumps(schema, ensure_ascii=False, separators=(',', ':'))
    schema_block = f'<script type="application/ld+json">\n{schema_json}\n</script>\n'

    # Find the first existing <script type="application/ld+json"> and insert before it
    ldj_pattern = r'(<script type="application/ld\+json">)'
    if not re.search(ldj_pattern, content, re.IGNORECASE):
        print(f"WARNING: No existing ld+json script in {fname}, inserting before </head>")
        new_content = content.replace('</head>', schema_block + '</head>', 1)
    else:
        new_content = re.sub(ldj_pattern, schema_block + r'\1', content, count=1, flags=re.IGNORECASE)

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(new_content)
    updated.append(fname)
    print(f"Updated: {fname} (title: {title!r})")

print(f"\nUpdated {len(updated)}: {updated}")
print(f"Skipped {len(skipped)}: {skipped}")
print(f"Errors {len(errors)}: {errors}")
