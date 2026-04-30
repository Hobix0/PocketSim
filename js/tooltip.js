const tooltip = document.getElementById("tooltip");

function tooltipShow(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  tooltip.style.left = x + 15 + "px";
  tooltip.style.top  = y + 15 + "px";
}

function tooltipMove(x, y) {
  tooltip.style.left = x + 15 + "px";
  tooltip.style.top  = y + 15 + "px";
}

function tooltipHide() {
  tooltip.style.display = "none";
}