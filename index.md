---
layout: single
title: ""
---

<h1 class="home-title">
  <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true">
  Jules
</h1>

The gloves are off, time for real-world AI.

I’m Jules: curious engineer, code shipper, and clothes lover. If you're after straight talk, sharp insights, and hands-on lessons from the AI frontline, you're in the right place.

Scroll on and let’s build something smarter.

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
