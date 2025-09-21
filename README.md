# Minimal Jekyll Blog

Local preview

1) Install Ruby (e.g., via rbenv or asdf). Ruby 3.x is fine.
2) Install Bundler: `gem install bundler` (if not present).
3) Install deps: `bundle install`
4) Serve locally: `bundle exec jekyll serve --livereload`
5) Open http://127.0.0.1:4000

Notes
- This uses the `github-pages` gem to match GitHub Pages’ environment.
- Posts live in `_posts/`. Home page is `index.md`.
- Update site config in `_config.yml`.

Theme and structure
- Theme: Minimal Mistakes via `remote_theme: mmistakes/minimal-mistakes`. Skin is set with `minimal_mistakes_skin` in `_config.yml`.
- Navigation: `_data/navigation.yml` defines the top nav (Home, Resources).
- Content separation: external links live in `_data/links.yml`; rendered via `_includes/resources-list.html` and used by `index.md` and `resources.md`.
- Pages vs posts: long‑lived content in root `.md` files; dated content in `_posts/` (`YYYY-MM-DD-title.md`).
- Config defaults: `_config.yml` sets `layout: single` for posts and pages and permalink style.
- Assets: `assets/css/main.scss` imports Minimal Mistakes (skin + core). Add custom CSS below imports.
- SEO/sitemap: `jekyll-seo-tag` and `jekyll-sitemap` enabled; set `url`/`baseurl` for correct canonical and sitemap URLs.
- Housekeeping: `404.html` and `robots.txt` included.

Favicon
- Put your favicon image at `assets/images/favicon.png` (PNG recommended), or set a custom path via `favicon` in `_config.yml`.
- The site auto-injects the favicon tags via `_includes/head/custom.html`.

Minimal Mistakes tips
- Use `layout: single` for most pages/posts. Optional front matter: `toc: true`, `classes: wide`, `author_profile: false`.
- To add a hero/intro on the home page, keep `layout: home` in `index.md` and add content there or use feature rows.
- For categories/tags archives, we can add Liquid-only archive pages compatible with GitHub Pages if desired.
- Content separation: external links live in `_data/links.yml`; rendered via `_includes/resources-list.html` and used by `index.md` and `resources.md`.
- Pages vs posts: long‑lived content in root `.md` files; dated content in `_posts/` (`YYYY-MM-DD-title.md`).
- Config defaults: `_config.yml` sets `layout` defaults and permalink style; header nav lists `resources.md`.
- Assets: custom CSS goes in `assets/css/main.scss` (front matter required for Jekyll to process SCSS). Minima can be overridden via variables before `@import "minima"`.
- SEO/sitemap: `jekyll-seo-tag` and `jekyll-sitemap` are enabled; GitHub Pages supports both.
- Housekeeping: `404.html` and `robots.txt` included; update `site.url` in `_config.yml` for correct sitemap URL.
