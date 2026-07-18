function getLocationHref(locationLike) {
  if (typeof locationLike === "string") {
    return locationLike;
  }

  if (locationLike && typeof locationLike.href === "string") {
    return locationLike.href;
  }

  return globalThis.location?.href || "http://localhost/";
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replace(/^\.?\//, "");
}

export function createAppPaths(locationLike = globalThis.location) {
  const appBaseUrl = new URL("./", getLocationHref(locationLike));

  function assetUrl(relativePath) {
    return new URL(normalizeRelativePath(relativePath), appBaseUrl);
  }

  return {
    basePath: appBaseUrl.pathname,
    assetPath(relativePath) {
      return assetUrl(relativePath).pathname;
    },
    assetUrl(relativePath) {
      return assetUrl(relativePath).toString();
    },
    serviceWorkerScriptUrl() {
      return assetUrl("sw.js").pathname;
    },
    serviceWorkerScope() {
      return appBaseUrl.pathname;
    },
  };
}
