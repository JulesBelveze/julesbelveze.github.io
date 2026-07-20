---
layout: single
title: Resources
permalink: /resources/
---

<p class="page-intro">Browse the writing by topic. Select a tag to narrow the list.</p>

<div class="tag-filter">
  <button class="tag-chip is-active" type="button" data-tag="all" aria-pressed="true">All</button>
  {% for pair in site.tags %}
    {% assign name = pair[0] %}
    <button class="tag-chip" type="button" data-tag="{{ name | escape }}" aria-pressed="false">{{ name }}</button>
  {% endfor %}
</div>

<ul id="filter-posts" class="post-cards">
{% for post in site.posts %}
  {% include post-card.html post=post filterable=true %}
{% endfor %}
</ul>

<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
