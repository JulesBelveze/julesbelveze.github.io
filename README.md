# Jules Belveze

This is a Jekyll site using the Minimal Mistakes theme and the GitHub Pages gem.

## Setup

Install a Ruby version manager that reads `.ruby-version`, then install Ruby 3.2.2. `mise`, `asdf`, and `rbenv` all work.

Run the setup script from the repository root:

```sh
script/setup
```

It installs the Bundler version locked in `Gemfile.lock` and the project gems.

## Common commands

```sh
script/serve  # Local preview at http://127.0.0.1:4000
script/build  # Production build in _site/
script/check  # Production build plus internal HTML checks
```

`script/check` does not request external URLs. Use it before opening a pull request.

## Content

- Pages are root-level Markdown files. Posts are in `_posts/` and follow `YYYY-MM-DD-title.md`.
- Posts without `link` are published on `/blog/`. A post with `link` opens the external article instead.
- Use `title` and `tags` on every post. Add `excerpt` when the automatic excerpt is not suitable.
- The site defaults posts and pages to `layout: single`. Set `toc: true`, `classes: wide`, or `author_profile: false` in front matter when needed.
- Navigation is in `_data/navigation.yml`. Optional home-page links belong in `_data/links.yml`.

## Configuration and deployment

Set the public URL and base path in `_config.yml`. For this user site, they are `https://julesbelveze.github.io` and an empty base URL.

GitHub Actions runs `script/check` on pull requests and deploys successful builds from `main`. In the repository settings, set Pages to use GitHub Actions.

The favicon and header logo use `assets/images/frame-shift-light.svg`. Update `favicon` or `logo` in `_config.yml` to use another asset.
