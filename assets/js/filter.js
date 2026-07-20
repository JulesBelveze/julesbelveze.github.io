document.addEventListener('DOMContentLoaded', function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('#filter-posts .post-card'));
  var status = document.querySelector('#filter-status');

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

    var hidden = tag !== 'all' && tags.indexOf(tag) === -1;
    card.hidden = hidden;
    return !hidden;
  }

  function apply(tag) {
    chips.forEach(function (chip) {
      setActiveChip(chip, tag);
    });
    var visibleCards = cards.filter(function (card) {
      return setCardVisibility(card, tag);
    });

    if (status) {
      var label = tag === 'all' ? 'all topics' : tag;
      status.textContent = 'Showing ' + visibleCards.length + ' posts for ' + label + '.';
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { apply(chip.dataset.tag); });
  });

  apply('all');
});
