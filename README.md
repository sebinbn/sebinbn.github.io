# Sebin Nidhiri's academic website

Quarto website targeting `https://sebinbn.github.io`, with rendered output in `docs/`.

## Build and preview

Requires Quarto. The build script uses `quarto` on PATH, then the Quarto bundled with macOS RStudio. Set `QUARTO_BIN` to use another executable. This migration was built with Quarto 1.9.38.

```sh
sh scripts/build.sh
python3 scripts/check_site.py
python3 -m http.server 8000 --directory docs
```

Open <http://localhost:8000>. With Quarto on PATH, `quarto preview` provides live reload. On this Mac, use `/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto preview`.

## Authoring

Edit `index.qmd` and section `index.qmd` files; style changes belong in `styles.css`. Never edit generated HTML. The build creates `docs/.nojekyll` after every successful render. Keep `docs/` in version control when commits are requested.

Add posts at `blog/posts/<slug>/index.qmd` with YAML fields `title`, `date` (`YYYY-MM-DD`), `categories`, and `description`. Use `draft: true` until ready. No sample articles are published.

Public downloads belong in `files/`, photos in `images/`. Add each new public resource to `_quarto.yml`; its explicit render and resource lists exclude repository instructions, scripts, and notes from the output. Shiny apps run on separate hosting and are linked from Apps.

## Deployment status

Remote: `https://github.com/sebinbn/sebinbn.github.io.git`. GitHub Pages should use **Deploy from a branch**, branch **main**, folder **/docs** (repository Settings → Pages). Push the source and freshly rendered `docs/` together after running the build and checks above.

No CNAME is active. Domain cutover requires a separate request; then add a source CNAME for `www.sebinbn.com`, list it as a resource, and update `website.site-url`. Keep the custom domain and DNS unchanged during staging.

See [MIGRATION.md](MIGRATION.md) for source mappings, preserved links, and gaps.
