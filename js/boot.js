// If something goes wrong, say so on the page instead of leaving it blank.
(function () {
  var shown = false;
  window.pondFail = function (msg) {
    if (shown) return; shown = true;
    var d = document.createElement("div"); d.className = "nogl"; d.style.zIndex = 9; d.style.padding = "24px"; d.style.textAlign = "center";
    d.textContent = msg; document.body.appendChild(d);
  };
  window.addEventListener("error", function (e) { window.pondFail("The pond hit an error: " + (e.message || e.type) + ". Reload to try again."); });
  window.addEventListener("unhandledrejection", function (e) { window.pondFail("The pond hit an error: " + (e.reason && e.reason.message || e.reason) + ". Reload to try again."); });
  setTimeout(function () {
    if (!window.pondStarted) window.pondFail("The pond could not load three.js from cdn.jsdelivr.net. An ad blocker, VPN or network filter may be blocking it; reload to try again.");
  }, 12000);
})();
