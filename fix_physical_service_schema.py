import os
import re
import json

base_dir = os.path.dirname(os.path.abspath(__file__))
physical_dir = os.path.join(base_dir, "physical")

pages = [
    "dental.html",
    "fitness.html",
    "healthcare.html",
    "heavy-machinery.html",
    "home-service.html",
    "legal.html",
    "real-estate.html",
]

# Map from page title (after stripping " | TMI Technology" or " | TMI") to industry name
# We'll derive from the title automatically

skipped = []
updated = []
errors = []

for fname in pages:
    fpath = os.path.join(physical_dir, fname)
    if not os.path.exists(fpath):
        print(f"ERROR: File not found: {fname}")
        errors.append(fname)
        continue

    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Check if Service schema already exists
    if '"@type":"Service"' in content or '"@type": "Service"' in content:
        print(f"SKIP (already has Service schema): {fname}")
        skipped.append(fname)
        continue

    # Extract title
    title_match = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE)
    if not title_match:
        print(f"ERROR: No title found in {fname}")
        errors.append(fname)
        continue
    page_title = title_match.group(1).strip()
    # Strip " | TMI Technology" or " | TMI" suffix
    industry_name = re.sub(r'\s*\|\s*TMI.*$', '', page_title).strip()
    # Strip leading "AI Systems for " if present to get the industry noun
    industry_noun = re.sub(r'^AI Systems for\s+', '', industry_name).strip()

    # Extract canonical URL
    canonical_match = re.search(r'<link rel="canonical" href="([^"]*)"', content, re.IGNORECASE)
    if not canonical_match:
        canonical_match = re.search(r"<link rel='canonical' href='([^']*)'", content, re.IGNORECASE)
    if not canonical_match:
        print(f"ERROR: No canonical found in {fname}")
        errors.append(fname)
        continue
    canonical = canonical_match.group(1).strip()

    # Build Service JSON-LD
    schema = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": f"AI Systems for {industry_noun}",
        "description": f"TMI builds custom AI operating infrastructure for {industry_noun} businesses — scheduling, dispatch, documentation, and field data capture. Done for you, installed and running.",
        "provider": {
            "@type": "Organization",
            "name": "TMI Technology",
            "url": "https://www.tmitechai.com"
        },
        "serviceType": "AI Operations Infrastructure",
        "areaServed": "US",
        "url": canonical
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
    print(f"Updated: {fname} (industry: {industry_noun!r})")

print(f"\nUpdated {len(updated)}: {updated}")
print(f"Skipped {len(skipped)}: {skipped}")
print(f"Errors {len(errors)}: {errors}")
