/** Proxy type sent to the Rust backend for each SSH connection. */
export interface ProxyConfig {
  proxy_type: "http" | "socks5";
  host: string;
  port: number;
}

export interface GlobalProxySettings {
  proxyType: "none" | "http" | "socks5";
  proxyHost: string;
  proxyPort: number;
  proxyBypass: string; // newline-separated bypass patterns
}

/**
 * Returns true if `host` matches any bypass pattern.
 *
 * Supported patterns:
 *   - Exact IP or domain: "localhost", "192.168.1.5"
 *   - IP wildcard prefix: "10.*", "192.168.*"
 *   - Domain suffix: "*.internal.com" or ".internal.com"
 */
export function matchesBypass(host: string, bypassPatterns: string): boolean {
  const h = host.toLowerCase();
  for (const raw of bypassPatterns.split(/[\n,]/)) {
    const pattern = raw.trim().replace(/^#+.*/, "").trim(); // ignore comments
    if (!pattern) continue;
    const p = pattern.toLowerCase();

    if (p === h) return true; // exact match

    if (p.endsWith(".*")) {
      // IP prefix wildcard: "10.*" matches "10.anything"
      const prefix = p.slice(0, -1); // "10."
      if (h.startsWith(prefix)) return true;
    }

    if (p.startsWith("*.")) {
      // Domain suffix wildcard: "*.internal.com" matches "foo.internal.com"
      const suffix = p.slice(1); // ".internal.com"
      if (h === suffix.slice(1) || h.endsWith(suffix)) return true;
    }

    if (p.startsWith(".")) {
      // Alternate suffix form: ".internal.com"
      if (h === p.slice(1) || h.endsWith(p)) return true;
    }
  }
  return false;
}

/**
 * Resolves the effective ProxyConfig for a connection.
 *
 * Priority: per-server override > global proxy.
 * Bypass list is checked last; if host matches, returns null (no proxy).
 *
 * Returns null when no proxy should be used.
 */
export function resolveProxy(
  serverProxyType: string,
  serverProxyHost: string | undefined,
  serverProxyPort: number | undefined,
  global: GlobalProxySettings,
  targetHost: string,
): ProxyConfig | null {
  // Check bypass list first
  if (matchesBypass(targetHost, global.proxyBypass)) return null;

  let effectiveType: string;
  let effectiveHost: string;
  let effectivePort: number;

  if (serverProxyType === "global") {
    effectiveType = global.proxyType;
    effectiveHost = global.proxyHost;
    effectivePort = global.proxyPort;
  } else if (serverProxyType === "none") {
    return null;
  } else {
    effectiveType = serverProxyType;
    effectiveHost = serverProxyHost ?? "";
    effectivePort = serverProxyPort ?? 0;
  }

  if (effectiveType === "none" || !effectiveHost || !effectivePort) return null;

  return {
    proxy_type: effectiveType as "http" | "socks5",
    host: effectiveHost,
    port: effectivePort,
  };
}
