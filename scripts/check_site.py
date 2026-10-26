"""Check rendered routes, local links/fragments, assets, and private-file exclusion."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re

ROOT = Path(__file__).resolve().parents[1] / 'docs'


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.links, self.ids, self.images = [], set(), []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        for key in ('href', 'src', 'poster'):
            if attrs.get(key):
                self.links.append(attrs[key])
        if tag == 'img':
            self.images.append(attrs)


errors = []
pages = {p.resolve(): Page(p) for p in ROOT.rglob('*.html')}
for route in ('', 'cv', 'research', 'teaching', 'teaching/fall-2026/econ-4325', 'teaching/fall-2026/econ-3320', 'apps', 'apps/central-limit-theorem', 'apps/sampling-distributions', 'apps/graphing-arma-series', 'blog', 'home', 'global-debt-flows', 'blog/posts/compoundinterest', 'blog/posts/inflation-is-a-good-thing', 'blog/posts/interest-rates'):
    if not (ROOT / route / 'index.html').is_file():
        errors.append(f'Missing route: /{route}')
for code in ('4325', '3320'):
    relative = Path(f'teaching/grade-policies/fall-2026/econ-{code}.txt')
    source = ROOT.parent / relative
    published = ROOT / relative
    if not published.is_file() or published.read_bytes() != source.read_bytes():
        errors.append(f'Missing or stale course policy: {relative}')
calculator = Path('teaching/grade-calculator/calculator.js')
for filename in ('simulator.js', 'simulator.css', 'statistics.mjs'):
    relative = Path('apps/graphing-arma-series') / filename
    if not (ROOT / relative).is_file() or (ROOT / relative).read_bytes() != (ROOT.parent / relative).read_bytes():
        errors.append(f'Missing or stale ARMA simulator asset: {relative}')
for filename in ('simulator.js', 'simulator.css', 'statistics.mjs'):
    relative = Path('apps/sampling-distributions') / filename
    if not (ROOT / relative).is_file() or (ROOT / relative).read_bytes() != (ROOT.parent / relative).read_bytes():
        errors.append(f'Missing or stale sampling simulator asset: {relative}')
if not (ROOT / calculator).is_file() or (ROOT / calculator).read_bytes() != (ROOT.parent / calculator).read_bytes():
    errors.append('Missing or stale grade calculator JavaScript')
for path, page in pages.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = (ROOT / unquote(url.path).lstrip('/') if url.path.startswith('/')
                  else path.parent / unquote(url.path)) if url.path else path
        if target.is_dir():
            target /= 'index.html'
        target = target.resolve()
        if not target.is_file():
            errors.append(f'{path.relative_to(ROOT)}: missing {link}')
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            errors.append(f'{path.relative_to(ROOT)}: missing fragment {link}')
    for img in page.images:
        if not img.get('alt', '').strip():
            errors.append(f'{path.relative_to(ROOT)}: image missing descriptive alt')
for path in ROOT.rglob('*'):
    if path.name in ('AGENTS.md', 'README.md', 'MIGRATION.md', 'CNAME', '.DS_Store') or path.suffix in ('.qmd', '.py', '.sh', '.yml'):
        errors.append(f'Internal or staging-forbidden output: {path.relative_to(ROOT)}')
for path in ROOT.rglob('*.css'):
    for link in re.findall(r'url\([\"\']?([^\)\"\']+)', path.read_text()):
        if not urlsplit(link).scheme and not link.startswith('#') and not (path.parent / link.split('?')[0]).is_file():
            errors.append(f'Missing CSS asset: {link}')
if not (ROOT / '.nojekyll').is_file():
    errors.append('Missing .nojekyll')
pdf = ROOT / 'files/NidhiriSebin_CV_B_v1.pdf'
if not pdf.is_file() or not pdf.read_bytes().startswith(b'%PDF-'):
    errors.append('CV is missing or not a PDF')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Passed: {len(pages)} pages; routes, local links/fragments, assets, image alt text, PDF, .nojekyll, and output exclusions.')
