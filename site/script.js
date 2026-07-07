const comparisonFrame = document.querySelector(".comparison-frame");
const comparisonRange = document.querySelector(".comparison-range");

function setComparison(value) {
  comparisonFrame.style.setProperty("--split", `${value}%`);
  comparisonRange.value = value;
}

if (comparisonFrame && comparisonRange) {
  let autoDirection = 1;
  let autoValue = Number(comparisonRange.value);
  let userHasInteracted = false;

  comparisonRange.addEventListener("input", (event) => {
    userHasInteracted = true;
    setComparison(event.target.value);
  });

  window.setInterval(() => {
    if (userHasInteracted) return;
    autoValue += autoDirection * 8;
    if (autoValue >= 68 || autoValue <= 32) {
      autoDirection *= -1;
    }
    setComparison(autoValue);
  }, 1200);
}
