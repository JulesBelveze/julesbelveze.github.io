---
layout: single
title: ""
---

<section class="home-hero">
  <p class="eyebrow">ML systems engineer · writer</p>
  <h1 class="home-title">
    <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true" width="80" height="80" fetchpriority="high">
    Make machine learning earn its compute.
  </h1>

  <div class="home-hero__copy">
    <p>I work on ML systems where model quality, latency, and cost pull in different directions.</p>

    <p>At <a href="https://dust.tt">Dust</a>, I build product infrastructure. Earlier, I worked on anomaly detection at Microsoft and multilingual NLP at <a href="https://hypefactors.com/">Hypefactors</a>, including systems serving about a billion inferences a day.</p>
  </div>

  <div class="home-hero__actions">
    <a class="button button--primary" href="{{ '/blog/' | relative_url }}">Read the blog</a>
    <a class="button button--secondary" href="{{ '/resources/' | relative_url }}">Browse resources</a>
  </div>

  <ul class="compute-receipt" aria-label="Areas of work">
    <li><strong>~1B</strong><span>inferences per day</span></li>
    <li><strong>NLP</strong><span>models in production</span></li>
    <li><strong>ML</strong><span>efficiency research</span></li>
  </ul>
</section>

{% include_cached resources-list.html %}

## Recent Posts

<ul class="post-list">
{% for post in site.posts limit:5 %}
  {% include post-card.html post=post %}
{% endfor %}
</ul>
