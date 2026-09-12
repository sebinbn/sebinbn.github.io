# Migration record

Inspected on 2026-09-12. The five requested Google Sites pages were read, then their HTML was retrieved once to extract links and embedded asset URLs absent from the text view. Reuse this record rather than crawling them again. User-supplied assets take precedence.

## Source map

| Source | New source / route | Content retained |
| --- | --- | --- |
| https://www.sebinbn.com/ | `index.qmd` → `/` | Biography, Houston role, May 2026 PhD, research interests, email, CV, JMP, video, GitHub, LinkedIn, WordPress |
| https://www.sebinbn.com/cv | `cv/index.qmd` → `/cv/` | CV download, original Drive CV and video biography link |
| https://www.sebinbn.com/research | `research/index.qmd` → `/research/` | Three working papers and full abstracts, work in progress, permanent working paper, three publications, coauthors and links |
| https://www.sebinbn.com/teaching | `teaching/index.qmd` → `/teaching/` | All appointments, courses, terms and five syllabus links |
| https://www.sebinbn.com/coding | Removed at the user's request | Originally migrated software experience and CPIS project; the project remains on Apps |
| https://www.sebinbn.com/home | `home/index.qmd` → `/home/` | Discovered navigation alias; redirect to `/` with a fallback link |
| https://www.sebinbn.com/global-debt-flows | `global-debt-flows/index.qmd` → `/global-debt-flows/` | Fetch failed (cache miss); project description and Shiny host recovered from Coding's HTML |
| https://www.sebinbn.com/blog | `blog/index.qmd` → `/blog/` | Fetch failed (cache miss); honest empty listing, existing WordPress link from Home |
| No separate source | `apps/index.qmd` → `/apps/` | Existing CPIS project from Coding; no invented apps |

Directory `index.html` files preserve extensionless old section paths on static hosting. Research and Teaching's discovered section fragment IDs are retained. Tracking redirects for GitHub, LinkedIn and WordPress were replaced with their direct destination URLs. Obvious extraction spacing artifacts (e.g. “202 6”, “I ntroductory”) and stray bullet characters were cleaned; publication details were otherwise preserved. Research abstracts describe their original time frame and were not rewritten as current claims.

## Assets and content gaps

- Existing `files/NidhiriSebin_CV_B_v1.pdf` is preserved unchanged and used for the local CV download. Its PDF signature is valid. The old CV embed labels its document `Sebin_CV_Oct2.pdf`; equivalence/version alignment with the supplied PDF has not been established, so the original Drive link is also retained.
- User supplied `images/homePortrait.jpg` and `images/teaching.jpg` during migration. Both are used unchanged with descriptive alt text. No fresh images were downloaded. Old branding/social icons are replaced by text links.
- No local originals were supplied for papers, slides, or syllabi; existing external URLs are retained. No error or login pages were saved as downloads.
- The Public Affairs Centre report URL returns **404**. Its original link and citation are retained; a replacement PDF is needed.
- SSRN returned **403**, both IGI Global chapters **429**, and LinkedIn **999**. These responses prevent automated availability confirmation; their original links are retained.
- The Shiny host returned **202**; the app's interactive operation is unverified. The site links to its separate hosting instead of embedding a server app in GitHub Pages.
- Other migrated external links returned **200**, including Drive viewer links, syllabi, GitHub, WordPress, coauthor pages and YouTube. HTTP success verifies reachability, not every document's permissions or interactive behavior.
- The first blog article was subsequently supplied and migrated; see the article record below. Two WordPress articles were subsequently requested and migrated; see the series record below.

## Validation and local status

- Existing repository had no commits and remote `https://github.com/sebinbn/sebinbn.github.io.git`. Existing instructions, PDF and photos were preserved; no repository reinitialization.
- Quarto 1.9.38 was found bundled at `/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto`. Build required access to Quarto's cache outside the sandbox.
- `sh scripts/build.sh` renders eleven Quarto pages into `docs/` and creates `.nojekyll`. The blog listing includes the compound interest article and both parts of All things Money.
- `python3 scripts/check_site.py` checks the original and article routes, rendered local links/fragments, image alt text, CSS assets, PDF signature, `.nojekyll`, and exclusion of internal source files. Responsive Bootstrap navigation and a mobile CSS breakpoint are configured; desktop/mobile visual inspection was not run because no browser automation tool was available in the session.
- No CNAME, DNS changes, commits, pushes or publishing. Staging URL is `https://sebinbn.github.io`; generated output is intentionally not ignored.


## Compound interest article (2026-09-12)

- Source: https://www.sebinbn.com/blog/compoundinterest. Web retrieval failed; one successful direct HTML retrieval recovered the full article and embedded `data-code` HTML. No further crawl is needed.
- Article: `blog/posts/compoundinterest/index.qmd`, listed in Blog under Mathematics and Compound interest. Original title and article text retained, with Markdown currency escaping and heading formatting. No publication date was present, so no date has been invented.
- At the user's request, the old article redirect was removed. Only `/blog/posts/compoundinterest/` is retained; the original source URL above is historical provenance, not a site hyperlink.
- App: `apps/compound-interest/calculator.html`, embedded locally with a descriptive iframe title and a standalone link. The original calculator has no external libraries, network calls, or server requirements. Added a document title, announced results/errors, visible keyboard focus, narrow-screen padding, and blank-input validation. Calculation and defaults are retained.
- Calculator JavaScript executed using Quarto's bundled Deno with a minimal DOM stub: default result $271.83 and interest $171.83; zero rate/time, negative rate, blank inputs, invalid negative principal/time, and overflow checks passed. This verifies calculation and validation logic, not browser layout. Browser visual inspection remains unavailable.


## Social links update

- Removed WordPress hyperlinks from Home and Blog at the user’s request. Earlier mentions above record the original migration only.
- Homepage GitHub and LinkedIn links use Quarto’s bundled Bootstrap icons with accessible link labels and keyboard focus styling. These are the only homepage social links.


## All things Money: Parts 1 and 2

| Original source | Local article | Publication date |
| --- | --- | --- |
| https://nidhiriwrites.wordpress.com/2020/04/11/inflation-is-a-good-thing/ | `blog/posts/inflation-is-a-good-thing/index.qmd` | April 11, 2020 |
| https://nidhiriwrites.wordpress.com/2020/04/24/interest-rates/ | `blog/posts/interest-rates/index.qmd` | April 24, 2020 |

- Each source was retrieved once successfully as HTML after the web reader failed. Publication dates come from the article's published metadata, not comment dates; both sources record January 26, 2021 as the last update, retained as `date-modified`.
- Article prose, reference links, and the final reading-topic list are retained. These are dated articles, not revisions of their economic claims. Added concise listing descriptions and Economics/Monetary policy categories based on the articles.
- Only article content was imported. Images, captions, comments, advertisements, sharing/like widgets, and all WordPress styles were excluded. The obsolete invitation to comment/share beneath Part 2 was omitted. Plain Markdown headings inherit the current Quarto theme; redundant in-body titles were removed and section heading levels normalized.
- Original cross-links used February paths despite the articles' April publication metadata. All links between the two articles now point to their local Quarto pages. No WordPress hyperlinks were added to the rendered site.
- No article assets are missing: images were intentionally excluded as requested. External references remain at their original URLs.
- Reference checks: BBC, Japan Times, LiveMint and RBI returned HTTP 200; Financial Times returned 403, and Toppr failed TLS validation with an expired certificate. Those two original links are retained but could not be verified.
- Build and local-link/asset checks passed for all 13 HTML pages (12 Quarto pages plus the calculator). Verified that the Blog listing has three articles, both imported dates are displayed, and the imported pages contain no images, WordPress styling, comment forms or sharing widgets. Browser layout inspection was unavailable.
