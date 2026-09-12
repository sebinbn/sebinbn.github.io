# Repository instructions

## Purpose and sources
- Build Sebin Bapty Nidhiri's academic website with research, teaching, coding, apps, blog, and CV pages.
- Migrate content from https://www.sebinbn.com/ and its /cv, /research, /teaching, and /coding pages. User-provided corrections override the old site.
- GitHub account: sebinbn. Intended repository: sebinbn.github.io; inspect the actual remote before assuming it matches. DNS provider: GoDaddy. Final domain: www.sebinbn.com.
- Preserve factual content, paper titles, coauthors, dates, and existing external links. Do not invent publications, affiliations, biography, apps, or testimonials.
- During migration, inspect each relevant source page once and record a concise source/URL map and missing assets in MIGRATION.md. Reuse this record; do not repeatedly crawl the site. If retrieval fails, migrate available material and report missing content without guessing.

## Architecture and authoring
- Use Quarto with Markdown (.qmd), Bootstrap-based styling, and minimal custom CSS/JavaScript. No React, Next.js, database, or server framework unless requested.
- Use index.qmd for Home; cv/index.qmd, research/index.qmd, teaching/index.qmd, coding/index.qmd, apps/index.qmd, and blog/index.qmd for sections. Blog posts go in blog/posts/<slug>/index.qmd.
- Preserve old paths, including any discovered /home link, using working pages or explicit redirects. Check old URLs as well as new navigation.
- Store public downloads in files/ and images in images/. Retain working external download links when local originals are unavailable. Never save an error/login page as a PDF or image.
- Use Quarto blog listings with dates and categories. Keep sample posts as drafts; do not publish invented articles. Empty Apps/Blog sections may have a brief honest empty state.
- Favor a restrained academic design: readable typography, white background, generous spacing, accessible contrast, responsive navigation, descriptive links, keyboard focus, and useful image alt text. Avoid decorative animations.

## Build and deployment
- Render locally to docs/; intended GitHub Pages source is main:/docs. Track rendered output for this publishing method.
- Provide a small reproducible build script that runs quarto render and ensures docs/.nojekyll exists after every build. Document the exact command in README.md.
- Configure explicit render/resource paths so AGENTS.md, README.md, MIGRATION.md, scripts, private inputs, and local notes are not copied into docs/. Never hand-edit generated HTML.
- Ignore .quarto/, .Rproj.user/, .Rhistory, .RData, .DS_Store, secrets, and temporary files; do not ignore docs/.
- Initially target https://sebinbn.github.io. Do not activate a CNAME or alter DNS during staging. At an explicitly requested domain cutover, preserve a source CNAME containing www.sebinbn.com, copy it through the build, and update website.site-url.
- Ordinary Shiny/Streamlit apps require separate hosting; link or embed them. Browser-only apps can use static assets. Never expose API secrets in client code.

## Working method and validation
- Inspect repository instructions, git status, existing files, remote, and Quarto availability before editing. Preserve user work and existing git history; do not reinitialize the repository.
- Implement complete bounded tasks with reasonable defaults. Ask only when missing information prevents a correct result. Do not install a second toolchain to bypass a missing Quarto installation; report the prerequisite.
- Keep this file focused on durable rules. Put setup commands in README.md and migration gaps in MIGRATION.md. Avoid large plans, repeated file dumps, unrelated refactors, and new test frameworks for this static site.
- After substantive changes, run the build; check internal links, local assets, expected routes, blog listings, and absence of internal files in docs/. Inspect representative desktop/mobile layouts when browser tools are available. State checks that could not be run.
- Finish with a concise account of changes, checks, remaining content gaps, and the preview command.
- Local implementation and validation are the default. Commit, push, publish, or change domain settings only when the user requests those actions; do not ask repeatedly when already authorized.
