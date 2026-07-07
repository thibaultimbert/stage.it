const layers = [...document.querySelectorAll(".photo-layer")];
const label = document.querySelector(".stage-label");
let activeIndex = 0;

function showNextImage() {
  layers[activeIndex].classList.remove("is-active");
  activeIndex = (activeIndex + 1) % layers.length;
  layers[activeIndex].classList.add("is-active");
  label.textContent = layers[activeIndex].dataset.label;
}

window.setInterval(showNextImage, 2400);
