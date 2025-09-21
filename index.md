---
layout: single
title: Jules
---

Welcome — this is a very small, static blog. Recent posts appear below.

## External resources

{% include resources-list.html %}

## Recent Posts

<ul class="post-list">
{% for post in site.posts limit:5 %}
  <li>
    <div style="margin: 0 0 .25rem 0; font-weight: 600;">
      {% if post.link %}
        <a href="{{ post.link }}" target="_blank" rel="noopener">{{ post.title }}</a>
      {% else %}
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      {% endif %}
    </div>
    <div class="post-excerpt" style="margin: 0 0 .75rem 0;">{{ post.excerpt | markdownify }}</div>
  </li>
{% endfor %}
</ul>
