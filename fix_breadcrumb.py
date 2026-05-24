import os
import re
import glob
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Collect target files
patterns = [
    os.path.join(BASE_DIR, 'ai-for-*.html'),
    os.path.join(BASE_DIR, 'competitor-*.html'),
    os.path.join(BASE_DIR, 'physical', '*.html'),
]

files = []
for pattern in patterns:
    files.extend(glob.glob(pattern))

files = sorted(set(files))

updated = 0
skipped_already = 0
skipped_missing = 0

for filepath in files:
    with open(filepath, encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Skip if already has BreadcrumbList
    if 'BreadcrumbList' in content:
        print(f'  [SKIP already has BreadcrumbList] {os.path.relpath(filepath, BASE_DIR)}')
        skipped_already += 1
        continue

    # Extract canonical URL
    canonical_match = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', content)
    if not canonical_match:
        print(f'  [SKIP no canonical URL] {os.path.relpath(filepath, BASE_DIR)}')
        skipped_missing += 1
        continue

    canonical_url = canonical_match.group(1).strip()

    # Extract page title, strip ' | TMI' suffix
    title_match = re.search(r'<title>([^<]+)</title>', content)
    if not title_match:
        print(f'  [SKIP no title] {os.path.relpath(filepath, BASE_DIR)}')
        skipped_missing += 1
        continue

    page_title = title_match.group(1).strip()
    # Strip ' | TMI' suffix (various forms)
    page_title = re.sub(r'\s*\|\s*TMI\s*$', '', page_title).strip()

    # Build JSON-LD
    schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "TMI",
                "item": "https://www.tmitechai.com"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": page_title,
                "item": canonical_url
            }
        ]
    }

    json_str = json.dumps(schema, separators=(',', ':'))
    script_block = f'<script type="application/ld+json">\n{json_str}\n</script>'

    # Find the last </script> tag inside <head>
    # Strategy: find </head>, then find the last </script> before it
    head_end_match = re.search(r'</head>', content, re.IGNORECASE)
    if not head_end_match:
        print(f'  [SKIP no </head>] {os.path.relpath(filepath, BASE_DIR)}')
        skipped_missing += 1
        continue

    head_end_pos = head_end_match.start()
    head_section = content[:head_end_pos]

    # Find the last </script> in the head section
    last_script_end = head_section.rfind('</script>')
    if last_script_end == -1:
        # No </script> in head — insert just before </head>
        insert_pos = head_end_pos
        new_content = content[:insert_pos] + script_block + '\n' + content[insert_pos:]
    else:
        # Insert after the last </script>
        insert_pos = last_script_end + len('</script>')
        new_content = content[:insert_pos] + '\n' + script_block + content[insert_pos:]

    with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
        f.write(new_content)

    print(f'  [UPDATED] {os.path.relpath(filepath, BASE_DIR)} -> "{page_title}" | {canonical_url}')
    updated += 1

print()
print(f'Done. Updated: {updated} | Already had BreadcrumbList: {skipped_already} | Skipped (missing data): {skipped_missing}')
