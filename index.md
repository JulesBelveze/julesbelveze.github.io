---
layout: single
title: ""
---

<section class="home-hero">
  <p class="eyebrow">Research Engineer · AI Agents</p>
  <h1 class="home-title">
    <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true" width="80" height="80" fetchpriority="high">
    <span>All things agents.</span>
  </h1>

  <div class="home-hero__copy">
    <p>I work at <a href="https://hcompany.ai/">H</a> on Computer Use Agents and especially how to evaluate them in production settings.</p>

    <p>I previously worked at <a href="https://dust.tt">Dust</a>, where I built product infrastructure and community. Earlier, I worked on anomaly detection at Microsoft and multilingual NLP at <a href="https://hypefactors.com/">Hypefactors</a>, including systems serving about a billion inferences a day.</p>
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
