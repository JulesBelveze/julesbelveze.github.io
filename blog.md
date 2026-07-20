---
layout: single
title: Blog
permalink: /blog/
---

<p class="page-intro">Notes on machine learning systems, model efficiency, and the engineering work around them.</p>

<ul class="post-list">
{% assign has_posts = false %}
{% for post in site.posts %}
  {% unless post.link %}
    {% assign has_posts = true %}
    {% include post-card.html post=post %}
  {% endunless %}
{% endfor %}

{% unless has_posts %}
  <li>No internal posts yet. Check back soon.</li>
{% endunless %}
</ul>
