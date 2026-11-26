(() => {
  "use strict";

  const root = document.documentElement;
  let topLevel = false;
  try {
    topLevel = window.self === window.top;
  } catch {}

  if (topLevel) {
    root.removeAttribute("hidden");
    return;
  }

  root.inert = true;
  root.setAttribute("aria-hidden", "true");
  root.style.setProperty("display", "none", "important");
  window.stop();
})();
