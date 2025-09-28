---
layout: single
title: ""
---

<h1 class="home-title">
  <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true">
  Jules
</h1>

I’m Jules, currently working as a Software Engineer @[Dust](https://dust.tt).

I previously worked as a researcher at Microsoft, on anomaly detection in high dimensional time series. Then fell in
love with all things Transformers and developed to NLP pipeline at [Hypefactors](https://hypefactors.com/). We dealt
with ~1B inferences/day on multi-lingual problems like NER and reputation analysis. As a side gig I worked on a few OSS
repository mostly around NLP and how to speed-up Transformer based models.

Scroll on and let's connect if there's anything you want to talk about!

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
