"""
SEO fix script: canonicals, OG URLs, title tags, OG images, BreadcrumbList, font-display
"""
import glob, re, os

CANONICAL_DOMAIN = "https://www.tmitechai.com"

# OG image fallbacks by page type
OG_IMAGES = {
    "physical": "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
    "system": "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
    "ai-for": "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
    "alternative": "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
    "vs-tmi": "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
    "default": "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1400&q=80",
}

# Correct titles for physical/ industry pages
PHYSICAL_TITLES = {
    "hvac.html": ("AI Systems for HVAC Companies | TMI Technology", "AI Systems for HVAC Companies | TMI Technology"),
    "construction.html": ("AI Systems for Construction Companies | TMI Technology", "AI Systems for Construction Companies | TMI Technology"),
    "roofing.html": ("AI Systems for Roofing Companies | TMI Technology", "AI Systems for Roofing Companies | TMI Technology"),
    "plumbing.html": ("AI Systems for Plumbing Companies | TMI Technology", "AI Systems for Plumbing Companies | TMI Technology"),
    "electrical.html": ("AI Systems for Electrical Contractors | TMI Technology", "AI Systems for Electrical Contractors | TMI Technology"),
    "oil-gas.html": ("AI Systems for Oil & Gas Companies | TMI Technology", "AI Systems for Oil & Gas Companies | TMI Technology"),
    "manufacturing.html": ("AI Systems for Manufacturing Companies | TMI Technology", "AI Systems for Manufacturing Companies | TMI Technology"),
    "mining.html": ("AI Systems for Mining Companies | TMI Technology", "AI Systems for Mining Companies | TMI Technology"),
    "fleet.html": ("AI Systems for Fleet Management | TMI Technology", "AI Systems for Fleet Management | TMI Technology"),
    "agriculture.html": ("AI Systems for Agriculture | TMI Technology", "AI Systems for Agriculture | TMI Technology"),
    "utilities.html": ("AI Systems for Utilities Companies | TMI Technology", "AI Systems for Utilities Companies | TMI Technology"),
    "concrete.html": ("AI Systems for Concrete Contractors | TMI Technology", "AI Systems for Concrete Contractors | TMI Technology"),
    "painting.html": ("AI Systems for Painting Contractors | TMI Technology", "AI Systems for Painting Contractors | TMI Technology"),
    "pest-control.html": ("AI Systems for Pest Control Companies | TMI Technology", "AI Systems for Pest Control Companies | TMI Technology"),
    "restoration.html": ("AI Systems for Restoration Companies | TMI Technology", "AI Systems for Restoration Companies | TMI Technology"),
    "heavy-machinery.html": ("AI Systems for Heavy Machinery | TMI Technology", "AI Systems for Heavy Machinery | TMI Technology"),
    "home-service.html": ("AI Systems for Home Service Companies | TMI Technology", "AI Systems for Home Service Companies | TMI Technology"),
    "dental.html": ("AI Systems for Dental Practices | TMI Technology", "AI Systems for Dental Practices | TMI Technology"),
    "healthcare.html": ("AI Systems for Healthcare Practices | TMI Technology", "AI Systems for Healthcare Practices | TMI Technology"),
    "fitness.html": ("AI Systems for Fitness Businesses | TMI Technology", "AI Systems for Fitness Businesses | TMI Technology"),
    "legal.html": ("AI Systems for Law Firms | TMI Technology", "AI Systems for Law Firms | TMI Technology"),
    "real-estate.html": ("AI Systems for Real Estate Operations | TMI Technology", "AI Systems for Real Estate Operations | TMI Technology"),
}


def get_clean_slug(filepath, url):
    """Return a clean slug path for the file."""
    # For physical/ pages, preserve the /physical/ prefix
    basename = os.path.basename(filepath)
    if filepath.startswith("physical/") or "physical\\" in filepath:
        slug = basename.replace(".html", "")
        return f"/physical/{slug}"
    # For all others, use the filename as slug
    slug = basename.replace(".html", "")
    return f"/{slug}"


def fix_canonical_and_og_url(content, filepath):
    """Fix canonical and og:url to use correct domain and clean URL."""
    basename = os.path.basename(filepath)
    slug = get_clean_slug(filepath, "")
    correct_url = f"{CANONICAL_DOMAIN}{slug}"

    # Fix canonical tag
    content = re.sub(
        r'(<link\s+rel="canonical"\s+href=")[^"]*(")',
        lambda m: f'{m.group(1)}{correct_url}{m.group(2)}',
        content
    )
    # Fix og:url
    content = re.sub(
        r'(property="og:url"\s+content=")[^"]*(")',
        lambda m: f'{m.group(1)}{correct_url}{m.group(2)}',
        content
    )
    # Fix twitter:url if present
    content = re.sub(
        r'(name="twitter:url"\s+content=")[^"]*(")',
        lambda m: f'{m.group(1)}{correct_url}{m.group(2)}',
        content
    )
    return content


def fix_og_image(content, filepath):
    """Add og:image and twitter:image if missing."""
    if 'og:image' in content:
        return content
    basename = os.path.basename(filepath)
    # Pick image
    if basename.startswith("ai-for"):
        img = OG_IMAGES["ai-for"]
    elif "alternative" in basename or "vs-tmi" in basename:
        img = OG_IMAGES["alternative"]
    elif filepath.startswith("physical"):
        img = OG_IMAGES["physical"]
    elif basename.startswith("system-"):
        img = OG_IMAGES["system"]
    else:
        img = OG_IMAGES["default"]

    og_tags = f'''<meta property="og:image" content="{img}"/>
<meta name="twitter:image" content="{img}"/>
'''
    # Insert before </head> or before first <style>
    if '<meta property="og:type"' in content:
        content = content.replace('<meta property="og:type"', og_tags + '<meta property="og:type"', 1)
    else:
        content = content.replace('</head>', og_tags + '</head>', 1)
    return content


def fix_title_tag(content, filepath):
    """Fix thin title tags on physical/ industry pages."""
    basename = os.path.basename(filepath)
    if basename not in PHYSICAL_TITLES:
        return content
    new_title, _ = PHYSICAL_TITLES[basename]
    old_title = re.search(r'<title>(.*?)</title>', content)
    if old_title and old_title.group(1) != new_title:
        content = re.sub(r'<title>.*?</title>', f'<title>{new_title}</title>', content)
        # Also fix og:title
        content = re.sub(
            r'(property="og:title"\s+content=")[^"]*(")',
            lambda m: f'{m.group(1)}{new_title}{m.group(2)}',
            content
        )
        # Fix twitter:title
        content = re.sub(
            r'(name="twitter:title"\s+content=")[^"]*(")',
            lambda m: f'{m.group(1)}{new_title}{m.group(2)}',
            content
        )
    return content


def fix_font_display(content):
    """Ensure Google Fonts URL includes display=swap."""
    # Replace googleapis font URLs missing display=swap
    content = re.sub(
        r'(https://fonts\.googleapis\.com/css2\?[^"\']+)(?<!&display=swap)(?<!display=swap)(")',
        lambda m: (m.group(1) + '&display=swap' + m.group(2)) if 'display=swap' not in m.group(1) else m.group(0),
        content
    )
    return content


def add_breadcrumb_schema(content, filepath):
    """Add BreadcrumbList schema to physical/ pages."""
    if 'BreadcrumbList' in content:
        return content
    basename = os.path.basename(filepath)
    if not (filepath.startswith("physical") or "physical\\" in filepath):
        return content
    slug = basename.replace(".html", "")
    page_name = slug.replace("-", " ").title()

    breadcrumb_json = f'''<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {{"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.tmitechai.com/"}},
    {{"@type": "ListItem", "position": 2, "name": "Industries", "item": "https://www.tmitechai.com/physical"}},
    {{"@type": "ListItem", "position": 3, "name": "{page_name}", "item": "https://www.tmitechai.com/physical/{slug}"}}
  ]
}}
</script>
'''
    # Insert before </head>
    content = content.replace('</head>', breadcrumb_json + '</head>', 1)
    return content


def add_website_schema(content):
    """Add WebSite schema with SearchAction to homepage."""
    if 'WebSite' in content:
        return content
    website_schema = '''<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "TMI Technology",
  "url": "https://www.tmitechai.com/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {"@type": "EntryPoint", "urlTemplate": "https://www.tmitechai.com/news?q={search_term_string}"},
    "query-input": "required name=search_term_string"
  }
}
</script>
'''
    content = content.replace('</head>', website_schema + '</head>', 1)
    return content


def add_person_schema(content):
    """Add Person schema for founder on homepage."""
    if '"Person"' in content:
        return content
    person_schema = '''<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Mia Louviere",
  "jobTitle": "Founder",
  "worksFor": {"@type": "Organization", "name": "TMI Technology", "url": "https://www.tmitechai.com/"},
  "url": "https://www.tmitechai.com/founders",
  "sameAs": ["https://www.tmitechai.com/founders"]
}
</script>
'''
    content = content.replace('</head>', person_schema + '</head>', 1)
    return content


# ===== PROCESS ALL FILES =====

physical_files = glob.glob("physical/*.html")
system_files = glob.glob("system-*.html")
article_files = glob.glob("article-*.html")
ai_for_files = glob.glob("ai-for-*.html")
comp_files = [f for f in glob.glob("*.html") if "alternative" in f or "vs-tmi" in f]
misc_files = ["contact.html", "news.html", "privacy.html", "terms.html", "about.html",
              "developers.html", "platform.html", "ai-for-oil-gas-companies.html",
              "role-multi-location.html", "role-owner-operator.html", "role-private-equity.html"]
misc_files = [f for f in misc_files if os.path.exists(f)]

all_processable = physical_files + system_files + article_files + ai_for_files + comp_files + misc_files

fixed = 0
skipped = 0

for filepath in all_processable:
    try:
        with open(filepath, encoding="utf-8") as f:
            original = f.read()
    except Exception as e:
        print(f"SKIP {filepath}: {e}")
        skipped += 1
        continue

    content = original

    # Skip admin and internal pages
    basename = os.path.basename(filepath)
    if basename.startswith("admin") or basename in ["console.html", "booking.html"]:
        skipped += 1
        continue

    # Skip online.tmitechai.com articles (intentional subdomain)
    if "online.tmitechai.com" in content and basename.startswith("article-online"):
        skipped += 1
        continue

    # Apply fixes
    content = fix_canonical_and_og_url(content, filepath)
    content = fix_og_image(content, filepath)
    content = fix_font_display(content)

    # Physical-specific
    if filepath.startswith("physical"):
        content = fix_title_tag(content, filepath)
        content = add_breadcrumb_schema(content, filepath)

    # Homepage
    if basename == "index.html":
        content = add_website_schema(content)
        content = add_person_schema(content)

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        fixed += 1
    else:
        skipped += 1

print(f"Fixed: {fixed} files")
print(f"Skipped/unchanged: {skipped} files")
