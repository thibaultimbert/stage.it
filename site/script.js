const carousel = document.querySelector(".hero-carousel");

if (carousel) {
  const track = carousel.querySelector(".carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const dots = Array.from(carousel.querySelectorAll(".carousel-dots button"));
  const label = carousel.querySelector(".carousel-pill");
  const counter = carousel.querySelector(".carousel-counter");
  const intervalMs = 2000;
  let currentIndex = 0;
  let timerId;

  function showSlide(nextIndex) {
    currentIndex = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    slides.forEach((slide, index) => {
      slide.setAttribute("aria-hidden", index === currentIndex ? "false" : "true");
    });

    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === currentIndex);
      dot.setAttribute("aria-current", index === currentIndex ? "true" : "false");
    });

    label.textContent = slides[currentIndex].dataset.label || "Product photo";
    counter.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  }

  function startCarousel() {
    window.clearInterval(timerId);
    timerId = window.setInterval(() => showSlide(currentIndex + 1), intervalMs);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      startCarousel();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(timerId);
      return;
    }

    startCarousel();
  });

  showSlide(0);
  startCarousel();
}
