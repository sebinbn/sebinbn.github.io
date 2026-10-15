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

## Course grade calculators

Fall 2026 calculators are linked beside each course's syllabus on Teaching. Edit the **source** policy files:

- `teaching/grade-policies/fall-2026/econ-4325.txt`
- `teaching/grade-policies/fall-2026/econ-3320.txt`

Both start with **dummy example values** and `policy_status = draft`. Draft pages show a setup notice, without example grading tables or student calculations. Replace the weights and cutoffs with verified course rules, then set `policy_status = ready`. No calculator JavaScript changes are required for weights, cutoffs, or additional weighted categories.

The files use a small INI-style format: section headings, `key = value` lines, and whole-line comments beginning with `#`. Use exactly these sections:

- `[course]`: `code`, `term`, and `policy_status` (`draft` or `ready`). The code and term must match the page.
- `[weights]`: numeric percentages from 0 to 100 totaling 100. Keep `exam1` and `exam2` (zero is allowed); these keys represent single exams. Other lowercase keys, such as `homework`, `quizzes`, `projects`, `participation`, or `lab_work`, produce category-average and completion inputs. Zero-weight categories appear in the overview but need no student inputs.
- `[grade_cutoffs]`: letter labels and inclusive minimum percentages, strictly descending, ending at 0. Add/remove letter labels as needed. Comparisons use unrounded percentages; display uses two decimals.

Unknown sections, duplicate keys, unsupported course settings, nonnumeric values, invalid totals, and invalid cutoffs disable the calculator with a useful message. Do not put special rules in comments and expect them to run. Dropped scores, replacement exams, extra credit, minimum-exam requirements, and course-specific rounding are **not implemented**. Leave a policy in draft if it needs these rules until the calculation logic supports them.

Students enter a current category average and the percentage of the category's **grading weight** completed. With unequal assignments, completion must reflect their points or weights, not simply the number of assignments. A blank exam means ungraded; a zero is a recorded zero. Future assumptions affect the projected final grade. The target planner uses only assumptions checked as “Fix for target” and solves for a common average on the rest. It distinguishes a target secured by completed scores from one dependent on future assumptions. No scores are sent to a server or saved in browser storage.

After editing policies, run the normal build and checks:

```sh
sh scripts/build.sh
python3 scripts/check_site.py
```

Preview over HTTP with `quarto preview` or the server command above; opening HTML directly as a local file cannot reliably load policy files. Rebuild and publish updated `docs/` for live changes. Policies are public assets: do not include student records or private notes.

For a future course, copy a policy to a new term/course filename, add a Quarto page following the existing examples, and update its title, course name, syllabus, `data-policy`, `data-course`, and `data-term`. Add the new page/policy paths to `_quarto.yml` and link it from Teaching. The shared calculator stays unchanged.

Optional calculation regression checks can be run with an existing Node installation: `node scripts/check_grades.js`. Node is not required to build or use the site.
