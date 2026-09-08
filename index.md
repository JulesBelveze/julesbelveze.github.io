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
      <a class="button button--primary" href="#selected-work">See selected work</a>
      <a class="button button--secondary" href="{{ '/blog/' | relative_url }}">Read the writing</a>
    </div>
  </div>

  <a class="home-hero__visual" href="{{ '/harnesses-becoming-state/' | relative_url }}" aria-label="Read Harnesses Are Becoming State">
    <img src="{{ '/assets/images/harnesses-becoming-state-cover.png' | relative_url }}" alt="Diagram showing an editable agent harness connected to prompts, memory, skills, and control flow" width="2752" height="1536" fetchpriority="high">
  </a>
</section>

<section class="home-section" id="selected-work">
  <p class="eyebrow">Selected work</p>
  <h2>From research questions to production systems.</h2>

  <ul class="selected-work">
    <li>
      <p class="selected-work__label">Agents · Evaluation</p>
      <div>
        <h3>Evaluation gates for self-evolving agents</h3>
        <p>A research direction for testing mutable prompts, memory, skills, and control flow before promotion.</p>
      </div>
      <a href="{{ '/harnesses-becoming-state/' | relative_url }}">Read the research note <span aria-hidden="true">→</span></a>
    </li>
    <li>
      <p class="selected-work__label">Inference · Scale</p>
      <div>
        <h3>Billions of daily NLP inferences</h3>
        <p>Engineering work on scaling PyTorch inference with ONNX Runtime in Microsoft production systems.</p>
      </div>
      <a href="https://cloudblogs.microsoft.com/opensource/2022/04/19/scaling-up-pytorch-inference-serving-billions-of-daily-nlp-inferences-with-onnx-runtime/" target="_blank" rel="noopener">Read the case study <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>
    </li>
    <li>
      <p class="selected-work__label">MLOps · NLP</p>
      <div>
        <h3>Media intelligence with Metaflow</h3>
        <p>A production case study on reliable machine-learning workflows for multilingual media intelligence.</p>
      </div>
      <a href="https://outerbounds.com/blog/mlops-media-intelligence/" target="_blank" rel="noopener">Read the case study <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>
    </li>
  </ul>
</section>

<section class="home-section" aria-labelledby="latest-writing">
  <p class="eyebrow">Writing</p>
  <h2 id="latest-writing">Latest notes</h2>

  <ul class="post-list post-list--compact">
  {% for post in site.posts limit:3 %}
    {% include post-card.html post=post compact=true heading_level=3 %}
  {% endfor %}
  </ul>
</section>
