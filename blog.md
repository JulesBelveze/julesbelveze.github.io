---
layout: single
title: Writing
permalink: /blog/
classes: wide
---

<p class="page-intro">Research notes and engineering write-ups on agents, evaluation, model efficiency, and machine-learning systems.</p>

<div class="tag-filter">
  <button class="tag-chip is-active" type="button" data-tag="all" aria-pressed="true">All</button>
  {% for pair in site.tags %}
    {% assign name = pair[0] %}
    <button class="tag-chip" type="button" data-tag="{{ name | escape }}" aria-pressed="false">{{ name }}</button>
  {% endfor %}
</div>

<p id="filter-status" class="sr-only" aria-live="polite"></p>

<ul id="filter-posts" class="post-list writing-list">
{% for post in site.posts %}
  {% if forloop.index <= 2 %}
    {% include post-card.html post=post filterable=true %}
  {% else %}
    {% include post-card.html post=post filterable=true compact=true %}
  {% endif %}
{% endfor %}
</ul>

<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
