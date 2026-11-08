# vile-blog.github.io

Personal landing page + blog, built with [Jekyll](https://jekyllrb.com/) and hosted on [GitHub Pages](https://pages.github.com/).

## Editing content

- **Personal info / hero / about text** — edit `_config.yml` (name, tagline, bio, social links) and `_includes/about.html`.
- **Roadmap** — edit `_data/roadmap.yml`. Each milestone has a `status` (`achieved`, `now`, or `target`), a `label`, and EN/VI `title`/`text`. Cards alternate above/below the track automatically, and the green progress fill stops at the milestone marked `now`. The `destination` entry is the flag at the end.
- **Projects** — edit `_data/projects.yml`. Add/remove entries; each needs `name`, `description`, `tags`, `github`, and optional `demo`.
- **Blog posts** — add a new file to `_posts/` named `YYYY-MM-DD-title.md` with front matter:
  ```yaml
  ---
  title: "Post Title"
  date: 2026-01-01 09:00:00 +0700
  excerpt: "One-line summary shown in the blog list."
  ---
  Post content in Markdown goes here.
  ```

## Reader features

Everything below is plain HTML/CSS/JS — no build step beyond Jekyll itself.

- **Command palette** — `Ctrl/Cmd+K` (or `/`, or the search button in the nav) searches every post and runs commands (jump to a section, toggle theme/language). It reads `/search.json`, which Jekyll generates from `search.json` at the repo root.
- **Hero terminal** — the box on the home page takes commands (`help`, `ls posts`, `cat roadmap`, `search <words>`, `lang vi`, `sudo hire me`…). Commands live in `assets/js/extras.js`.
- **Knowledge graph** — `/blog/#graph` links posts through the tags they share. Tags used by only one post are left out, so give related posts a common tag to connect them.
- **Highlights & private notes** (posts only) — readers select text to highlight in 4 colours, attach a note, copy a quote, or copy a link to the passage. Stored in the reader's own browser (`localStorage`), never uploaded.
- **Per-paragraph comments** (posts only) — the 💬 button beside a paragraph (or in the selection toolbar) opens a public thread for just that paragraph. Each thread is a GitHub Discussion created by giscus on the first comment, titled `<post path>#<paragraph id>`. The id is a hash of the paragraph's opening text, so editing a paragraph's first ~160 characters starts a fresh thread for it.
- **Reading progress bar + table of contents** — built automatically from the post's `##` headings.

### Writing callouts and sidenotes

In a post, put a kramdown attribute line right after a blockquote to turn it into a callout. The label ("Key idea", "Watch out"…) is added by CSS and switches with the EN/VI toggle, so just write the text:

```markdown
> **No single point of anything.** Two rules fall out of this: …
{: .callout .callout-key}
```

Types: `callout-key`, `callout-warn`, `callout-tip` (intuition), `callout-note` (aside).

For a margin note, drop an inline span into a paragraph. On wide screens it floats into the right margin; on narrow screens the number is tapped to expand it:

```markdown
…look *identical* until you wait long enough to be sure.<span class="sn">In practice that means a timeout…</span>
```

Keep sidenotes in the same language block (`en` / `vi`) as the paragraph they belong to.

## Running locally

Requires Ruby + Bundler.

```bash
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000.

## Deploying

Push to the `main` branch of this repo (must be named `<your-username>.github.io`) and enable GitHub Pages in the repo Settings → Pages → Source: `main` branch. The site publishes automatically at `https://<your-username>.github.io`.
