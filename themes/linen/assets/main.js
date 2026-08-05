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

// Slideshow section — dependency-free carousel (dots, arrows, optional autoplay)
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-slideshow]").forEach((root) => {
    const slides = Array.from(root.querySelectorAll(".slideshow__slide"));
    if (!slides.length) return;
    let idx = 0;
    const dotsWrap = root.querySelector(".slideshow__dots");
    const show = (i) => {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle("is-active", n === idx));
      if (dotsWrap) Array.from(dotsWrap.children).forEach((d, n) => d.classList.toggle("is-active", n === idx));
    };
    if (slides.length > 1) {
      root.classList.add("section-slideshow--multi");
      slides.forEach((_, n) => {
        const dot = document.createElement("button");
        dot.type = "button"; dot.className = "slideshow__dot"; dot.setAttribute("aria-label", "Go to slide " + (n + 1));
        dot.addEventListener("click", () => show(n));
        if (dotsWrap) dotsWrap.appendChild(dot);
      });
      const prev = root.querySelector(".slideshow__nav--prev");
      const next = root.querySelector(".slideshow__nav--next");
      if (prev) prev.addEventListener("click", () => show(idx - 1));
      if (next) next.addEventListener("click", () => show(idx + 1));
      if (root.dataset.autoplay) {
        let timer = setInterval(() => show(idx + 1), 5000);
        root.addEventListener("mouseenter", () => clearInterval(timer));
        root.addEventListener("mouseleave", () => { timer = setInterval(() => show(idx + 1), 5000); });
      }
    }
    show(0);
  });
});
