// Casper Theme – main.js
// Vanilla JS enhancements. htmx and Alpine handle most interactivity.

document.addEventListener('DOMContentLoaded', () => {
  // Animate cart count badge when updated by htmx
  document.body.addEventListener('htmx:afterSwap', (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('cart-count')) {
      el.classList.remove('cart-count-updated');
      void el.offsetWidth; // reflow
      el.classList.add('cart-count-updated');
    }
  });

  // Variant selector: update price display when variant changes
  const variantSelect = document.getElementById('variant-select');
  if (variantSelect) {
    variantSelect.addEventListener('change', () => {
      const selected = variantSelect.options[variantSelect.selectedIndex];
      const price = selected.dataset.price;
      const priceEl = document.getElementById('product-price');
      if (price && priceEl) priceEl.textContent = price;
    });
  }
});

// Nova hero product slider — native scroll-snap enhanced with arrows/dots/autoplay.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('[data-track]');
    const dotsWrap = slider.querySelector('[data-dots]');
    if (!track) return;
    const slides = Array.from(track.children);
    if (slides.length < 2) { if (dotsWrap) dotsWrap.style.display = 'none'; return; }

    // Distance to advance one slide (slide width + gap), measured live so it stays responsive.
    const step = () => {
      const a = slides[0].getBoundingClientRect();
      return slides[1] ? slides[1].getBoundingClientRect().left - a.left : a.width;
    };

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'nova-slider__dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      dot.addEventListener('click', () => track.scrollTo({ left: i * step(), behavior: 'smooth' }));
      if (dotsWrap) dotsWrap.appendChild(dot);
    });
    const dots = dotsWrap ? Array.from(dotsWrap.children) : [];

    let raf;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / step());
        dots.forEach((d, j) => d.classList.toggle('active', j === i));
      });
    });

    const prev = slider.querySelector('[data-prev]');
    const next = slider.querySelector('[data-next]');
    if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

    if (slider.dataset.autoplay === '1') {
      const ms = (parseInt(slider.dataset.interval, 10) || 5) * 1000;
      const advance = () => {
        const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step(), behavior: 'smooth' });
      };
      let timer = setInterval(advance, ms);
      slider.addEventListener('mouseenter', () => clearInterval(timer));
      slider.addEventListener('mouseleave', () => { timer = setInterval(advance, ms); });
    }
  });
});
