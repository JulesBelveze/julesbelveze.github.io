---
layout: single
title: ""
---

<section class="home-hero">
  <p class="eyebrow">Software engineer · ML systems</p>
  <h1 class="home-title">
    <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true">
    Jules Belveze
  </h1>

  <div class="home-hero__copy">
    <p>I’m Jules, currently working as a Software Engineer @<a href="https://dust.tt">Dust</a>.</p>

    <p>I previously worked as a researcher at Microsoft, on anomaly detection in high dimensional time series. Then fell in love with all things Transformers and developed to NLP pipeline at <a href="https://hypefactors.com/">Hypefactors</a>. We dealt with ~1B inferences/day on multi-lingual problems like NER and reputation analysis. As a side gig I worked on a few OSS repository mostly around NLP and how to speed-up Transformer based models.</p>
  </div>

  <div class="home-hero__actions">
    <a class="button button--primary" href="{{ '/blog/' | relative_url }}">Read the blog</a>
    <a class="button button--secondary" href="{{ '/resources/' | relative_url }}">Browse resources</a>
  </div>
</section>

{% include_cached resources-list.html %}

## Recent Posts

<ul class="post-list">
{% for post in site.posts limit:5 %}
  {% include post-card.html post=post %}
{% endfor %}
</ul>
