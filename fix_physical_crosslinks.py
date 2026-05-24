import re
import os

os.chdir(r'C:\Users\mialo\tmi-landing-1')

# Cross-links: each page -> list of (slug, label) tuples
CROSS_LINKS = {
    'hvac':           [('plumbing', 'Plumbing'), ('electrical', 'Electrical'), ('home-service', 'Home Service')],
    'plumbing':       [('hvac', 'HVAC'), ('electrical', 'Electrical'), ('home-service', 'Home Service')],
    'electrical':     [('hvac', 'HVAC'), ('plumbing', 'Plumbing'), ('construction', 'Construction')],
    'construction':   [('roofing', 'Roofing'), ('concrete', 'Concrete'), ('electrical', 'Electrical')],
    'roofing':        [('construction', 'Construction'), ('painting', 'Painting'), ('restoration', 'Restoration')],
    'concrete':       [('construction', 'Construction'), ('heavy-machinery', 'Heavy Machinery'), ('mining', 'Mining')],
    'painting':       [('roofing', 'Roofing'), ('restoration', 'Restoration'), ('construction', 'Construction')],
    'restoration':    [('roofing', 'Roofing'), ('painting', 'Painting'), ('home-service', 'Home Service')],
    'manufacturing':  [('heavy-machinery', 'Heavy Machinery'), ('utilities', 'Utilities'), ('mining', 'Mining')],
    'heavy-machinery':[('construction', 'Construction'), ('mining', 'Mining'), ('manufacturing', 'Manufacturing')],
    'mining':         [('heavy-machinery', 'Heavy Machinery'), ('oil-gas', 'Oil & Gas'), ('utilities', 'Utilities')],
    'oil-gas':        [('mining', 'Mining'), ('utilities', 'Utilities'), ('fleet', 'Fleet')],
    'utilities':      [('oil-gas', 'Oil & Gas'), ('manufacturing', 'Manufacturing'), ('mining', 'Mining')],
    'fleet':          [('oil-gas', 'Oil & Gas'), ('construction', 'Construction'), ('home-service', 'Home Service')],
    'home-service':   [('hvac', 'HVAC'), ('plumbing', 'Plumbing'), ('electrical', 'Electrical')],
    'pest-control':   [('home-service', 'Home Service'), ('agriculture', 'Agriculture'), ('lawn-landscaping', None)],
    'agriculture':    [('fleet', 'Fleet'), ('heavy-machinery', 'Heavy Machinery'), ('mining', 'Mining')],
    'dental':         [('healthcare', 'Healthcare'), ('real-estate', 'Real Estate'), ('legal', 'Legal')],
    'healthcare':     [('dental', 'Dental'), ('real-estate', 'Real Estate'), ('legal', 'Legal')],
    'fitness':        [('home-service', 'Home Service'), ('real-estate', 'Real Estate'), ('healthcare', 'Healthcare')],
    'legal':          [('real-estate', 'Real Estate'), ('healthcare', 'Healthcare'), ('dental', 'Dental')],
    'real-estate':    [('legal', 'Legal'), ('construction', 'Construction'), ('home-service', 'Home Service')],
}

def build_crosslink_section(links):
    chips = []
    for slug, label in links:
        if label is None:
            continue
        chips.append(
            f'<a href="/physical/{slug}" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;'
            f'border:1px solid var(--line-strong);border-radius:999px;font-family:var(--sans);font-size:13px;'
            f'color:var(--ink-2);transition:all 0.2s;text-decoration:none;" '
            f'onmouseover="this.style.background=\'var(--bg-alt)\';this.style.color=\'var(--ink)\'" '
            f'onmouseout="this.style.background=\'transparent\';this.style.color=\'var(--ink-2)\'">'
            f'{label} <span style="font-size:11px;opacity:0.5;">&rarr;</span></a>'
        )

    return (
        '\n<section style="padding:64px 0;background:var(--bg);border-top:1px solid var(--line);">\n'
        '  <div class="container">\n'
        '    <p style="font-family:var(--sans);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;'
        'color:var(--muted);margin:0 0 20px;">Related Industries</p>\n'
        '    <div style="display:flex;flex-wrap:wrap;gap:12px;">\n      '
        + '\n      '.join(chips) +
        '\n    </div>\n  </div>\n</section>\n\n'
    )

count = 0
for slug, links in CROSS_LINKS.items():
    filename = f'physical/{slug}.html'
    if not os.path.exists(filename):
        print(f"NOT FOUND: {filename}")
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'Related Industries' in content:
        print(f"Already has cross-links: {filename}")
        continue

    section_html = build_crosslink_section(links)

    # Insert before footer
    footer_match = re.search(r'\n<footer', content)
    if footer_match:
        pos = footer_match.start()
        content = content[:pos] + '\n' + section_html + content[pos:]
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
        print(f"Added cross-links: {filename}")
    else:
        print(f"No footer found: {filename}")

print(f"\nTotal physical pages updated: {count}")
