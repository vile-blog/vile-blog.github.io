# vile-blog.github.io

Personal landing page + blog, built with [Jekyll](https://jekyllrb.com/) and hosted on [GitHub Pages](https://pages.github.com/).

## Editing content

- **Personal info / hero / about text** — edit `_config.yml` (name, tagline, bio, social links) and `_includes/about.html`.
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

## Running locally

Requires Ruby + Bundler.

```bash
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000.

## Deploying

Push to the `main` branch of this repo (must be named `<your-username>.github.io`) and enable GitHub Pages in the repo Settings → Pages → Source: `main` branch. The site publishes automatically at `https://<your-username>.github.io`.
