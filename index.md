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
    <p>I currently work at <a href="https://hcompany.ai/">H</a> as a researcher on Self-Evolving Computer Use Agents and more broadly how to evaluate CUAs in production settings.</p>

    <p>I was previously at <a href="https://dust.tt">Dust</a>, operating as a software engineer on all things agentic and building a community. Earlier, my research focus was on anomaly detection at Microsoft and how to scale multilingual NLP (back when it was cool) at <a href="https://hypefactors.com/">Hypefactors</a>.</p>
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
