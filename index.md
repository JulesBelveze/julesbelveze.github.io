---
layout: single
classes: wide
---

<section class="home-hero">
  <div class="home-hero__intro">
    <p class="eyebrow">Research Engineer · AI Agents</p>
    <h1 class="home-title">
      <img class="home-title__logo" src="{{ site.logo | default: site.favicon | relative_url }}" alt="" aria-hidden="true" width="80" height="80" fetchpriority="high">
      <span>I build agents that can improve safely.</span>
    </h1>

    <div class="home-hero__copy">
      <p>At <a href="https://hcompany.ai/">H</a>, I research self-evolving computer-use agents and how to evaluate changes without regressing what already works.</p>
      <p>Previously, I built agentic software and community at <a href="https://dust.tt">Dust</a>, worked on anomaly detection at Microsoft, and scaled multilingual NLP at <a href="https://hypefactors.com/">Hypefactors</a>.</p>
    </div>

    <div class="home-hero__actions">
      <a class="button button--primary" href="#writing">Read the writing</a>
    </div>
  </div>

</section>

<section class="home-section" id="writing" aria-labelledby="writing-title">
  <h2 id="writing-title">Writing</h2>

  <div class="tag-filter">
    <button class="tag-chip is-active" type="button" data-tag="all" aria-pressed="true">All</button>
    {% for pair in site.tags %}
      {% assign name = pair[0] %}
      <button class="tag-chip" type="button" data-tag="{{ name | escape }}" aria-pressed="false">{{ name }}</button>
    {% endfor %}
  </div>

  <p id="filter-status" class="sr-only" aria-live="polite"></p>

  <ul id="filter-posts" class="post-list post-list--compact">
  {% for post in site.posts %}
    {% include post-card.html post=post compact=true filterable=true heading_level=3 %}
  {% endfor %}
  </ul>
</section>

<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
