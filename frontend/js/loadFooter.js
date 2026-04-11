const footerAppBasePath = getFooterAppBasePath();

function getFooterAppBasePath() {
  if (document.currentScript?.src) {
    const { pathname } = new URL(document.currentScript.src, window.location.href);
    const match = pathname.match(/^(.*)\/js\/[^/]+$/);

    if (match) {
      return match[1] || "";
    }
  }

  const frontendMatch = window.location.pathname.match(/^(.*\/frontend)(?:\/|$)/);
  return frontendMatch?.[1] || "";
}

function withFooterBasePath(path) {
  if (!path || !path.startsWith("/")) return path;
  return `${footerAppBasePath}${path}`;
}

function rewriteFooterRootPaths(container) {
  if (!container || !footerAppBasePath) return;

  container
    .querySelectorAll('[href^="/"], [src^="/"], [action^="/"]')
    .forEach((element) => {
      ["href", "src", "action"].forEach((attribute) => {
        const value = element.getAttribute(attribute);

        if (value && value.startsWith("/") && !value.startsWith("//")) {
          element.setAttribute(attribute, withFooterBasePath(value));
        }
      });
    });
}

async function fetchFooterMarkup() {
  const candidateUrls = [
    withFooterBasePath("/components/footer.html"),
    new URL("../../components/footer.html", window.location.href).pathname
  ];

  const uniqueUrls = [...new Set(candidateUrls)];
  let lastError;

  for (const url of uniqueUrls) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load footer");
}

document.addEventListener("DOMContentLoaded", async () => {
  const footerContainer = document.getElementById("footer");

  if (!footerContainer) return;

  try {
    const data = await fetchFooterMarkup();
    footerContainer.innerHTML = data;
    rewriteFooterRootPaths(footerContainer);
  } catch (error) {
    console.log("Footer load error:", error);
  }
});
