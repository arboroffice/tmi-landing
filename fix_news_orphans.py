"""
Add 15 orphaned articles to news.html grid and update the count to 60.
"""
import re, os
os.chdir(r'C:\Users\mialo\tmi-landing-1')

def pexels(photo_id, w=900):
    return f'https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w={w}&q=80'

ARTICLES = [
    {
        'href': 'article-servicetitan-alternative.html',
        'img': pexels(3785927),
        'cat': 'Operations',
        'mins': 7,
        'title': 'Is ServiceTitan Worth It for a Mid-Size Operation?',
        'deck': 'Enterprise field service software was built for large multi-location franchises. Most mid-size operators are paying for complexity they cannot use.',
    },
    {
        'href': 'article-budget-overruns.html',
        'img': pexels(1216589),
        'cat': 'Operations',
        'mins': 6,
        'title': 'Why Construction Jobs Run Over Budget',
        'deck': 'Cost overruns are so common they\'re expected. Most aren\'t inevitable - they accumulate from small gaps that add up to a loss.',
    },
    {
        'href': 'article-change-orders.html',
        'img': pexels(1216589),
        'cat': 'The Trades',
        'mins': 6,
        'title': 'How to Price a Change Order Without Killing the Relationship',
        'deck': 'Change orders cause more customer friction than the original bid. Most of that friction is avoidable with a clear system.',
    },
    {
        'href': 'article-crew-accountability.html',
        'img': pexels(3785927),
        'cat': 'The Trades',
        'mins': 6,
        'title': 'Your Field Crew Isn\'t Accountable Because You Haven\'t Made It Possible',
        'deck': 'Accountability problems in the field are almost always systems problems in disguise. When crews don\'t have clear checkpoints, they improvise.',
    },
    {
        'href': 'article-crew-ignores-apps.html',
        'img': pexels(1078884),
        'cat': 'The Trades',
        'mins': 7,
        'title': 'Why Your Crew Ignores Every App You Buy Them',
        'deck': 'Your crew\'s resistance to the new software isn\'t laziness. It\'s feedback. Software built for an office doesn\'t work in the field.',
    },
    {
        'href': 'article-equipment-lost.html',
        'img': pexels(1078884),
        'cat': 'Operations',
        'mins': 6,
        'title': 'The Equipment Your Crew Can\'t Find',
        'deck': 'Equipment spread across job sites, rental yards, and service trucks without a real-time system is a hidden cost that compounds daily.',
    },
    {
        'href': 'article-expensive-dispatcher.html',
        'img': pexels(3229014),
        'cat': 'The Trades',
        'mins': 5,
        'title': 'You\'re the Most Expensive Dispatcher in Your Company',
        'deck': 'Every call to find where the crew is, every text chasing a status update, every schedule change you\'re managing personally is dispatch work.',
    },
    {
        'href': 'article-idle-time.html',
        'img': pexels(1108101),
        'cat': 'The Trades',
        'mins': 6,
        'title': 'Your Crew Is Ready. The Job Isn\'t.',
        'deck': 'Crew shows up and the materials aren\'t there. Or the permit isn\'t pulled. Or the last sub left the site in the wrong state. Idle time compounds.',
    },
    {
        'href': 'article-missed-maintenance.html',
        'img': pexels(3489900),
        'cat': 'Operations',
        'mins': 6,
        'title': 'The Equipment That Fails Was Almost Always Going to Fail',
        'deck': 'Unplanned downtime costs three to four times more than scheduled maintenance. The signals were there beforehand - they just weren\'t being read.',
    },
    {
        'href': 'article-paperless-offline.html',
        'img': pexels(3184418),
        'cat': 'The Trades',
        'mins': 5,
        'title': 'Paper Forms Cost You More Than Time',
        'deck': 'Paper forms aren\'t just slow - they\'re a reliability problem. What goes paperless in the field still needs to work when there\'s no signal.',
    },
    {
        'href': 'article-pricing-accuracy.html',
        'img': pexels(3862130),
        'cat': 'The Trades',
        'mins': 6,
        'title': 'Most Trades Companies Price from Memory. That\'s Why Margins Vary.',
        'deck': 'Job costs vary not because the work varies but because estimating is inconsistent. Every job priced differently means every job profited differently.',
    },
    {
        'href': 'article-subcontractors.html',
        'img': pexels(1108101),
        'cat': 'Operations',
        'mins': 6,
        'title': 'How to Manage Subcontractors When You Can\'t See What They\'re Doing',
        'deck': 'Subcontractors are the biggest coordination wildcard in construction. The only way to manage them without friction is a system that runs without you.',
    },
    {
        'href': 'article-training-replacement.html',
        'img': pexels(3760583),
        'cat': 'The Trades',
        'mins': 6,
        'title': 'Training New Hires by Shadowing Doesn\'t Scale',
        'deck': 'Training that lives in experienced heads leaves when they do. The knowledge that makes your best people good needs to be captured before they\'re gone.',
    },
    {
        'href': 'article-online-launch-burnout.html',
        'img': pexels(3184465),
        'cat': 'Operations',
        'mins': 7,
        'title': 'Every Launch Is a 60-Day Sprint',
        'deck': 'Every launch that ends with you exhausted and starting over is a systems failure, not a marketing failure. Here\'s what infrastructure-driven launches look like.',
    },
    {
        'href': 'article-online-lead-followup.html',
        'img': pexels(3182812),
        'cat': 'Operations',
        'mins': 6,
        'title': 'The Follow-Up Problem Isn\'t Your Offer',
        'deck': 'Leads with real buying intent go cold every day - not because your offer is wrong but because your follow-up system doesn\'t exist.',
    },
]

def make_card(a):
    return f'''
      <a class="story reveal" href="{a['href']}" data-cat="{a['cat'].replace('&', '&amp;')}">
        <div class="story-photo" style="background-image:url('{a['img']}')"></div>
        <div class="story-meta"><span class="cat">{a['cat']}</span><span>{a['mins']} min</span></div>
        <h3>{a['title']}</h3>
        <p>{a['deck']}</p>
        <span class="story-read">Read &#8594;</span>
      </a>
'''

with open('news.html', encoding='utf-8') as f:
    content = f.read()

# Check which articles are already in news.html
to_add = []
for a in ARTICLES:
    if a['href'] not in content and a['href'].replace('.html', '') not in content:
        to_add.append(a)

print(f'Articles to add: {len(to_add)}')

# Build the cards HTML
new_cards = ''.join(make_card(a) for a in to_add)

# Insert after the opening of stories-grid
content = content.replace(
    '<div class="stories-grid">\n',
    '<div class="stories-grid">\n' + new_cards,
    1
)

# Update count: replace existing count with 60
content = re.sub(
    r'\d+ articles &middot; updated weekly',
    '60 articles &middot; updated weekly',
    content
)

with open('news.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Added {len(to_add)} articles to news.html. Count updated to 60.')
