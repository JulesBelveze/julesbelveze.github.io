document.addEventListener('DOMContentLoaded', function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('#filter-posts .post-card'));

  function apply(tag) {
    chips.forEach(function (c) {
      var active = c.dataset.tag === tag;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    cards.forEach(function (card) {
      var tags = (card.dataset.tags || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      var show = tag === 'all' || tags.indexOf(tag) !== -1;
      card.style.display = show ? '' : 'none';
    });
  }

  chips.forEach(function (chip) {
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', function () { apply(chip.dataset.tag); });
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(chip.dataset.tag); }
    });
  });

  apply('all');
});
