"""
Fixes:
1. P0: ai-for-oil-gas-companies.html - add meta description + H1
2. P0: founders.html - fix canonical/og:url to www
3. P0: article-online-launch-burnout.html, article-online-lead-followup.html - fix canonical/og:url
4. Add canonical to about.html and audit.html
5. Add outcomes link to index.html hero/nav area
"""
import re, os
os.chdir(r'C:\Users\mialo\tmi-landing-1')

# 1. Fix ai-for-oil-gas-companies.html
with open('ai-for-oil-gas-companies.html', encoding='utf-8') as f:
    c = f.read()

# Add meta description after title
if '<meta name="description"' not in c:
    c = c.replace(
        '<title>AI for Oil and Gas Companies | TMI</title>',
        '<meta name="description" content="TMI builds custom AI systems for oil and gas operators - crew dispatch, predictive maintenance, compliance documentation, and field data capture. Done for you, installed and running."/>\n<title>AI for Oil and Gas Companies | TMI</title>'
    )

# Add H1 to body (before the redirect section)
if '<h1' not in c:
    c = c.replace(
        '<body>',
        '<body>\n<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">AI for Oil and Gas Companies</h1>'
    )

with open('ai-for-oil-gas-companies.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed: ai-for-oil-gas-companies.html')

# 2. Fix founders.html
with open('founders.html', encoding='utf-8') as f:
    c = f.read()
c = c.replace('href="https://tmitechai.com/founders"', 'href="https://www.tmitechai.com/founders"')
with open('founders.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed: founders.html')

# 3. Fix online article canonicals
for filename, slug in [
    ('article-online-launch-burnout.html', 'article-online-launch-burnout'),
    ('article-online-lead-followup.html', 'article-online-lead-followup'),
]:
    with open(filename, encoding='utf-8') as f:
        c = f.read()
    # Fix canonical
    c = re.sub(r'<link rel="canonical" href="[^"]*"', f'<link rel="canonical" href="https://www.tmitechai.com/{slug}"', c)
    # Fix og:url
    c = re.sub(r'<meta property="og:url" content="[^"]*"', f'<meta property="og:url" content="https://www.tmitechai.com/{slug}"', c)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f'Fixed: {filename}')

# 4. Add canonical to about.html
with open('about.html', encoding='utf-8') as f:
    c = f.read()
if 'rel="canonical"' not in c:
    c = c.replace('<title>', '<link rel="canonical" href="https://www.tmitechai.com/about"/>\n<title>', 1)
    with open('about.html', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Fixed: about.html - canonical added')

# Add canonical to audit.html
with open('audit.html', encoding='utf-8') as f:
    c = f.read()
if 'rel="canonical"' not in c:
    c = c.replace('<title>', '<link rel="canonical" href="https://www.tmitechai.com/audit"/>\n<title>', 1)
    with open('audit.html', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Fixed: audit.html - canonical added')

# 5. Add outcomes link to index.html
with open('index.html', encoding='utf-8') as f:
    c = f.read()

if 'outcomes' not in c:
    # Find the side nav links section and add Outcomes
    old_nav = '<a href="/about">About</a>\n    <a href="/partners">Partners</a>'
    new_nav = '<a href="/about">About</a>\n    <a href="/outcomes">Outcomes</a>\n    <a href="/partners">Partners</a>'
    if old_nav in c:
        c = c.replace(old_nav, new_nav, 1)
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(c)
        print('Fixed: index.html - outcomes nav link added')
    else:
        print('WARN: index.html nav pattern not found - check manually')
else:
    print('index.html already has outcomes link')

print('\nAll P0 and misc fixes complete.')
