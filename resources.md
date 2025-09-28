---
layout: single
title: Resources
permalink: /resources/
---

<div class="tag-filter">
  <button class="tag-chip is-active" data-tag="all">All</button>
  {% for pair in site.tags %}
    {% assign name = pair[0] %}
    <button class="tag-chip" data-tag="{{ name | escape }}">{{ name }}</button>
  {% endfor %}
  </div>

<ul id="filter-posts" class="post-cards">
{% for post in site.posts %}
  <li class="post-card" data-tags="{% for t in post.tags %}{{ t }}{% unless forloop.last %},{% endunless %}{% endfor %}">
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

<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
