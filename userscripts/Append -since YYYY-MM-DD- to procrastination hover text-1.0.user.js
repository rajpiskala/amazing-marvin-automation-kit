// ==UserScript==
// @name         Append "since YYYY-MM-DD" to procrastination hover text
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Updates data-lhover3 tooltips like "Days procrastinated: 10" to "Days procrastinated: 10 (since YYYY-MM-DD)" and keeps new elements in sync.
// @author       OpenAI
// @match        https://app.amazingmarvin.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const ATTR = "data-lhover3";
  const MARKER = "data-procrastination-hover-patched";
  const RE = /(procrastinated\s*:\s*)(\d+)/i;

  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getSinceDate(days) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return formatLocalDate(date);
  }

  function buildUpdatedHoverText(text) {
    if (typeof text !== "string") return null;
    if (!text.toLowerCase().includes("procrastinated")) return null;

    const match = text.match(RE);
    if (!match) return null;

    const days = Number(match[2]);
    if (!Number.isFinite(days)) return null;

    // Remove an existing appended date so reruns stay clean/idempotent.
    const baseText = text.replace(/\s*\(since\s+\d{4}-\d{2}-\d{2}\)\s*$/i, "");
    const sinceDate = getSinceDate(days);

    return `${baseText} (since ${sinceDate})`;
  }

  function patchElement(el) {
    if (!(el instanceof Element)) return;
    if (!el.hasAttribute(ATTR)) return;

    const current = el.getAttribute(ATTR);
    const updated = buildUpdatedHoverText(current);
    if (!updated) return;

    if (current !== updated) {
      el.setAttribute(ATTR, updated);
    }

    if (!el.hasAttribute(MARKER)) {
      el.setAttribute(MARKER, "true");

      // If app code rewrites the hover text later, refresh on hover.
      el.addEventListener(
        "mouseenter",
        () => {
          const latest = el.getAttribute(ATTR);
          const refreshed = buildUpdatedHoverText(latest);
          if (refreshed && latest !== refreshed) {
            el.setAttribute(ATTR, refreshed);
          }
        },
        { passive: true }
      );
    }
  }

  function patchTree(root = document) {
    if (root instanceof Element) {
      patchElement(root);
      root.querySelectorAll(`[${ATTR}]`).forEach(patchElement);
      return;
    }

    document.querySelectorAll(`[${ATTR}]`).forEach(patchElement);
  }

  function installObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === ATTR) {
          patchElement(mutation.target);
          continue;
        }

        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              patchTree(node);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [ATTR],
    });

    return observer;
  }

  function init() {
    if (!document.body) {
      requestAnimationFrame(init);
      return;
    }

    patchTree(document);
    installObserver();
    console.log("[TM] Procrastination hover augmenter installed");
  }

  init();
})();