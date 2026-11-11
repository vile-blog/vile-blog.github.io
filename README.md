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
- **Knowledge graph** — `/blog/#graph` links posts through the tags they share. Tags used by only one post are left out, but every post also hangs off a hub for its category (book notes / paper notes / writing); give related posts a common tag to link them more tightly.
- **Highlights & private notes** (posts only) — readers select text to highlight in 4 colours, attach a note, copy a quote, or copy a link to the passage. Stored in the reader's own browser (`localStorage`), never uploaded.
- **Per-block comments** (posts only) — the 💬 button in the left margin (or in the selection toolbar) opens a public thread for whatever you point at: paragraphs, headings, list items, code blocks, table cells, callouts, images/diagrams. Each thread is a GitHub Discussion created by giscus on the first comment, titled `<post path>#<paragraph id>`. The id is a hash of the block's opening text (the image path for image-only paragraphs), so editing a block's first ~160 characters starts a fresh thread for it. To keep a thread through any edit, pin the block with kramdown: put `{: data-cid="why-quorums"}` on the line right after it (letters, digits and dashes only; the id is then `<lang>-why-quorums`).
- **Reading progress bar + table of contents** — built automatically from the post's `##` headings.

- **Focus mode** (posts only) — the "Focus mode" link next to the reading time (or the `F` key) hides the nav, chat and TOC and enlarges the text. The choice is remembered.
- **Keyboard shortcuts** (posts only) — `j` / `k` next / previous section, `g g` top, `G` bottom, `f` focus, `?` shows the list.
- **Prev / next + related posts** — book chapters link to the previous / next *chapter* (by `book_chapter_num`); other posts link by date. "If you liked this" ranks other posts by shared tags, weighting rare tags higher (the DDIA tag every chapter carries is ignored).
- **Roadmap deep links** — `/#roadmap-3` opens milestone 3's details directly; the dialog has a "Copy link" button.
- **Share image** — `assets/og-default.png` (1200×630) is the default OpenGraph / Twitter card (`image:` in `_config.yml`). Give a post its own with `image:` in its front matter.
- **The Lab** (`/lab/`) — six interactive distributed-systems experiments: Raft leader election with crashes, network partitions and quorum writes; a consistent-hashing ring with virtual nodes vs. `hash mod N`; an N/W/R quorum stale-read experiment; **gossip** (rumour spreading with push/pull/push-pull, plus SWIM failure detection with indirect probes, suspicion and refutation); **CRDTs** (PN-counter and OR-set beside naïve last-write-wins copies, with replicas you can take offline); and a **tab cluster** where every open tab of the page is a real node that elects a leader over `BroadcastChannel` (the leader's tab title gets a ♛), replicates a counter through it, and is compared with the Web Locks API. The tab cluster is the only one that is not a simulation, so open `/lab/#tabs` in two or three tabs. Code in `assets/js/lab.js`, styles in `assets/css/lab.css` (loaded only when a page sets `lab: true`). Each card has one-click experiments, click-to-inspect nodes/servers/replicas, and a **Deep dive** (overview, how it works, real-world use cases, papers, further reading, related posts). That text lives in `_data/lab.yml` (bilingual `en`/`vi` fields) and is rendered by `_includes/lab-deep.html`; tabs are deep-linkable, e.g. `/lab/#raft-papers`.
- **Listen mode** (posts only) — the "🔊 Listen" link (or `L`) reads the post aloud with the browser's built-in speech synthesis, highlighting the paragraph and the current word, with prev/next/speed controls. English and Vietnamese voices depend on the OS.
- **Chaos Monkey & kernel panic** — `chaos [seconds]` in the hero terminal (or the palette) "kills" random cards with a 503 that heals with exponential backoff; click one to restart it by hand. `sudo rm -rf /` makes the whole page fall to the bottom of the window (Esc reboots). Code in `assets/js/chaos.js`.
- **Hidden extras** — the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) or `matrix` in the hero terminal toggles a green-on-black "hacker" theme.

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
