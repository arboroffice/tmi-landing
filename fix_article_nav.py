import re
import os

os.chdir(r'C:\Users\mialo\tmi-landing-1')

articles = [f for f in os.listdir('.') if f.startswith('article-') and f.endswith('.html')]

count = 0
for filename in articles:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add Outcomes link if not already there
    if 'href="outcomes.html"' in content or 'href="/outcomes"' in content:
        continue

    # Insert after Field Notes link in ah-nav
    old = '<a href="news.html">Field Notes</a>\n      <a href="about.html">About</a>'
    new = '<a href="news.html">Field Notes</a>\n      <a href="outcomes.html">Outcomes</a>\n      <a href="about.html">About</a>'

    if old in content:
        content = content.replace(old, new, 1)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1

print(f"Updated {count} articles with Outcomes nav link")
