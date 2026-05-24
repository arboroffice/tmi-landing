import os
import re

physical_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "physical")

files = [f for f in os.listdir(physical_dir) if f.endswith(".html")]
files.sort()

skipped = []
updated = []

for fname in files:
    slug = fname.replace(".html", "")
    fpath = os.path.join(physical_dir, fname)
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Check if og:url already exists
    if 'property="og:url"' in content or "property='og:url'" in content:
        skipped.append(fname)
        continue

    # Find og:type tag to insert before it
    og_type_pattern = r'(<meta property="og:type")'
    if not re.search(og_type_pattern, content):
        # Try single quotes
        og_type_pattern = r"(<meta property='og:type')"
        if not re.search(og_type_pattern, content):
            print(f"WARNING: No og:type found in {fname}, skipping")
            skipped.append(fname)
            continue

    og_url_tag = f'<meta property="og:url" content="https://www.tmitechai.com/physical/{slug}"/>\n'
    new_content = re.sub(og_type_pattern, og_url_tag + r'\1', content, count=1)

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(new_content)
    updated.append(fname)
    print(f"Updated: {fname}")

print(f"\nUpdated {len(updated)} files: {updated}")
print(f"Skipped {len(skipped)} files: {skipped}")
