---
layout: single
title: Blog
permalink: /blog/
---

Just things I like to talk about and wanted to share.

<ul class="post-list">
{% assign has_posts = false %}
{% for post in site.posts %}
  {% unless post.link %}
    {% assign has_posts = true %}
    <li>
      <div style="margin: 0 0 .25rem 0; font-weight: 600;">
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      </div>
      <div class="post-excerpt" style="margin: 0 0 .75rem 0;">{{ post.excerpt | markdownify }}</div>
    </li>
  {% endunless %}
{% endfor %}

{% unless has_posts %}
  <li>No internal posts yet. Check back soon.</li>
{% endunless %}
</ul>

