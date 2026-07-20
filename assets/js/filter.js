document.addEventListener('DOMContentLoaded', function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('#filter-posts .post-card'));

  function setActiveChip(chip, tag) {
    var active = chip.dataset.tag === tag;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function setCardVisibility(card, tag) {
    var tags = (card.dataset.tags || '')
      .split(',')
      .map(function (value) { return value.trim(); })
      .filter(Boolean);

    card.hidden = tag !== 'all' && tags.indexOf(tag) === -1;
  }

  function apply(tag) {
    chips.forEach(function (chip) {
      setActiveChip(chip, tag);
    });
    cards.forEach(function (card) {
      setCardVisibility(card, tag);
    });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { apply(chip.dataset.tag); });
  });

  apply('all');
});
