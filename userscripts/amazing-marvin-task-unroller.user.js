// ==UserScript==
// @name         Amazing Marvin - Task Unroller
// @namespace    https://app.amazingmarvin.com/
// @version      0.5.0
// @description  Expands a just-created Marvin task like "8:00am Read 20m ($1..3)" or "Do Assignment #$1..3".
// @author       Raj Piskala
// @match        https://app.amazingmarvin.com/*
// @match        https://amazingmarvin.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      serv.amazingmarvin.com
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const DEFAULT_API_ROOT = "https://serv.amazingmarvin.com/api";
  const STORE = {
    apiRoot: "amTaskUnroller.apiRoot",
    apiToken: "amTaskUnroller.apiToken",
    fullAccessToken: "amTaskUnroller.fullAccessToken",
  };

  const LOOP_PATTERN = /\$(\d+)\s*\.\.\s*(\d+)/;
  const TASK_SELECTOR = '[data-item-type="task"]';
  const TITLE_SELECTOR = ".TitlePart";
  const API_DELAY_MS = 1100;
  const DOC_READ_RETRIES = 7;
  const DOC_READ_RETRY_MS = 900;

  const ADD_TASK_FIELDS = [
    "day",
    "parentId",
    "labelIds",
    "firstScheduled",
    "rank",
    "dailySection",
    "bonusSection",
    "customSection",
    "timeBlockSection",
    "note",
    "dueDate",
    "timeEstimate",
    "isReward",
    "isStarred",
    "isFrogged",
    "plannedWeek",
    "plannedMonth",
    "rewardPoints",
    "rewardId",
    "backburner",
    "reviewDate",
    "itemSnoozeTime",
    "permaSnoozeTime",
  ];

  const processedTaskIds = new Set();
  let apiQueue = Promise.resolve();

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * +++++++++++++++++++++ Frontend / Toast +++++++++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function showToast(message, isError) {
    document.getElementById("am-task-unroller-toast")?.remove();

    const toast = document.createElement("div");
    toast.id = "am-task-unroller-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      padding: "10px 12px",
      borderRadius: "6px",
      background: isError ? "rgba(180, 38, 38, 0.95)" : "rgba(38, 38, 38, 0.94)",
      color: "#fff",
      font: "13px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.22)",
      pointerEvents: "none",
      maxWidth: "390px",
    });

    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), isError ? 5200 : 2800);
  }

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * +++++++++++++++++ Tampermonkey Configuration +++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function gmGet(key, fallback) {
    try {
      return GM_getValue(key, fallback);
    } catch (_) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      GM_setValue(key, value);
    } catch (_) {
      localStorage.setItem(key, value);
    }
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== "function") return;

    GM_registerMenuCommand("Set Marvin full access token", () => {
      const token = prompt(
        "Paste your Amazing Marvin full access token. It is used to read and rename the original task.",
        gmGet(STORE.fullAccessToken, ""),
      );
      if (token != null) {
        gmSet(STORE.fullAccessToken, token.trim());
        showToast("Amazing Marvin full access token saved.");
      }
    });

    GM_registerMenuCommand("Set Marvin API token", () => {
      const token = prompt(
        "Paste your limited Amazing Marvin API token. It is used to create the unrolled copies with addTask.",
        gmGet(STORE.apiToken, ""),
      );
      if (token != null) {
        gmSet(STORE.apiToken, token.trim());
        showToast("Amazing Marvin API token saved.");
      }
    });

    GM_registerMenuCommand("Set Marvin API base URL", () => {
      const endpoint = prompt("API base URL. Use the public API or desktop local API server.", getApiRoot());
      if (endpoint != null) {
        gmSet(STORE.apiRoot, normalizeApiRoot(endpoint));
        showToast("Amazing Marvin API base URL saved.");
      }
    });
  }

  function getStoredToken(key, label) {
    let token = gmGet(key, "");
    if (token) return token;

    token = prompt(`Task Unroller needs your Amazing Marvin ${label}.`, "");
    if (!token) return "";

    token = token.trim();
    gmSet(key, token);
    return token;
  }

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * +++++++++++++++++++++ Backend / API ++++++++++++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function normalizeApiRoot(value) {
    const raw = (value || DEFAULT_API_ROOT).trim() || DEFAULT_API_ROOT;
    return raw.replace(/\/addTask$/i, "").replace(/\/$/, "");
  }

  function getApiRoot() {
    return normalizeApiRoot(gmGet(STORE.apiRoot, DEFAULT_API_ROOT));
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function queueApiCall(work) {
    apiQueue = apiQueue.then(async () => {
      const result = await work();
      await sleep(API_DELAY_MS);
      return result;
    });
    apiQueue.catch(() => {});
    return apiQueue;
  }

  function apiPath(path) {
    return `${getApiRoot()}${path}`;
  }

  function parseApiResponse(response) {
    if (response.response != null) return response.response;
    if (!response.responseText) return null;

    try {
      return JSON.parse(response.responseText);
    } catch (_) {
      return response.responseText;
    }
  }

  function requestJson(method, path, headers, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: apiPath(path),
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        responseType: "json",
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(parseApiResponse(response));
            return;
          }
          reject(new Error(`Marvin API returned ${response.status}: ${response.responseText || response.statusText}`));
        },
        onerror() {
          reject(new Error("Marvin API request failed."));
        },
        ontimeout() {
          reject(new Error("Marvin API request timed out."));
        },
      });
    });
  }

  function fullAccessHeaders() {
    const token = getStoredToken(STORE.fullAccessToken, "full access token");
    if (!token) throw new Error("Missing Amazing Marvin full access token.");

    return {
      "Content-Type": "application/json",
      "X-Full-Access-Token": token,
    };
  }

  function apiTokenHeaders() {
    const token = getStoredToken(STORE.apiToken, "API token");
    if (!token) throw new Error("Missing Amazing Marvin API token.");

    return {
      "Content-Type": "application/json",
      "X-API-Token": token,
      "X-Auto-Complete": "false",
    };
  }

  function readDoc(itemId) {
    return queueApiCall(() =>
      requestJson("GET", `/doc?id=${encodeURIComponent(itemId)}`, fullAccessHeaders()),
    );
  }

  async function readDocWithRetry(itemId) {
    let lastError = null;

    for (let attempt = 0; attempt < DOC_READ_RETRIES; attempt += 1) {
      try {
        const doc = await readDoc(itemId);
        if (doc?._id) return doc;
      } catch (error) {
        lastError = error;
      }
      await sleep(DOC_READ_RETRY_MS);
    }

    throw lastError || new Error(`Could not read created Marvin task ${itemId}.`);
  }

  function updateOriginalTask(itemId, spec) {
    const now = Date.now();
    const setters = [
      { key: "title", val: spec.title },
      { key: "updatedAt", val: now },
      { key: "fieldUpdates.title", val: now },
      { key: "fieldUpdates.updatedAt", val: now },
    ];

    if (spec.taskTime) {
      setters.push({ key: "taskTime", val: spec.taskTime });
      setters.push({ key: "fieldUpdates.taskTime", val: now });
    }

    return queueApiCall(() =>
      requestJson("POST", "/doc/update", fullAccessHeaders(), {
        itemId,
        setters,
      }),
    );
  }

  function addTask(task) {
    return queueApiCall(() =>
      requestJson("POST", "/addTask", apiTokenHeaders(), {
        ...task,
        timeZoneOffset: -new Date().getTimezoneOffset(),
      }),
    );
  }

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * +++++++++++++++++++++ Loop Expansion +++++++++++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function parseDurationMillis(text) {
    const match = String(text || "").match(
      /(?:^|\s)(?:~|ca\.?\s*)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i,
    );
    if (!match) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return Math.round(amount * (match[2].toLowerCase().startsWith("h") ? 60 : 1) * 60 * 1000);
  }

  function parseTitleTime(text) {
    const match =
      String(text || "").match(/^(\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
      String(text || "").match(/(^|\s)(\d{1,2})(?:(?::(\d{2}))\s*(am|pm)?|\s+(am|pm))\b/i);
    if (!match) return null;

    return normalizeTimeParts({
      index: match.index + match[1].length,
      length: match[0].length - match[1].length,
      hourText: match[2],
      minuteText: match[3] ?? "00",
      suffix: match[4] || match[5] || "",
      source: "title",
    });
  }

  function parseStoredTaskTime(taskTime) {
    const match = String(taskTime || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    return normalizeTimeParts({
      index: null,
      length: 0,
      hourText: match[1],
      minuteText: match[2],
      suffix: "",
      source: "taskTime",
    });
  }

  function normalizeTimeParts(parts) {
    let hour = Number(parts.hourText);
    const minute = Number(parts.minuteText);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

    if (parts.suffix) {
      const suffix = parts.suffix.toLowerCase();
      if (hour < 1 || hour > 12) return null;
      if (suffix === "pm" && hour !== 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
    } else if (hour > 23) {
      return null;
    }

    return {
      ...parts,
      hour,
      minute,
      hasSuffix: Boolean(parts.suffix),
      padHour: parts.source === "taskTime" || parts.hourText.length > 1,
    };
  }

  function formatShiftedTime(time, offsetMillis) {
    const totalMinutes = (time.hour * 60 + time.minute + Math.round(offsetMillis / 60000)) % 1440;
    const normalizedMinutes = totalMinutes < 0 ? totalMinutes + 1440 : totalMinutes;
    let hour = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;

    if (time.source === "taskTime") {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    if (time.hasSuffix) {
      const suffix = hour >= 12 ? "pm" : "am";
      hour %= 12;
      if (hour === 0) hour = 12;
      return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
    }

    return `${time.padHour ? String(hour).padStart(2, "0") : String(hour)}:${String(minute).padStart(2, "0")}`;
  }

  function getLoopMarker(text, loopMatch) {
    let startIndex = loopMatch.index;
    let endIndex = loopMatch.index + loopMatch[0].length;
    let parenthesized = false;

    const openMatch = text.slice(0, startIndex).match(/\(\s*$/);
    const closeMatch = text.slice(endIndex).match(/^\s*\)/);
    if (openMatch && closeMatch) {
      startIndex -= openMatch[0].length;
      endIndex += closeMatch[0].length;
      parenthesized = true;
    }

    return {
      startIndex,
      endIndex,
      parenthesized,
      counterWidth: loopMatch[1].length,
    };
  }

  function replaceLoopMarker(text, loop, counter) {
    const counterText = String(counter).padStart(loop.marker.counterWidth, "0");
    const replacement = loop.marker.parenthesized ? `(${counterText}/${loop.end})` : counterText;
    return `${text.slice(0, loop.marker.startIndex)}${replacement}${text.slice(loop.marker.endIndex)}`
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function replaceTitleTime(text, time, offsetMillis) {
    if (!time || time.source !== "title") return text;
    return `${text.slice(0, time.index)}${formatShiftedTime(time, offsetMillis)}${text.slice(time.index + time.length)}`;
  }

  function parseLoop(text, doc) {
    const rawText = String(text || "");
    const loopMatch = rawText.match(LOOP_PATTERN);
    if (!loopMatch) return null;

    const start = Number(loopMatch[1]);
    const end = Number(loopMatch[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;

    const durationMillis = doc?.timeEstimate || parseDurationMillis(rawText);
    const time = parseTitleTime(rawText) || parseStoredTaskTime(doc?.taskTime);
    if (time && !durationMillis) {
      throw new Error("Looped timed tasks need a duration so later start times can be calculated.");
    }

    return {
      start,
      end,
      rawText,
      durationMillis: durationMillis || null,
      marker: getLoopMarker(rawText, loopMatch),
      time,
    };
  }

  function expandLoop(loop) {
    const specs = [];

    for (let counter = loop.start; counter <= loop.end; counter += 1) {
      const offset = loop.durationMillis ? loop.durationMillis * (counter - loop.start) : 0;
      const title = replaceTitleTime(replaceLoopMarker(loop.rawText, loop, counter), loop.time, offset);
      const spec = { title };
      if (loop.time?.source === "taskTime") spec.taskTime = formatShiftedTime(loop.time, offset);
      specs.push(spec);
    }

    return specs;
  }

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * +++++++++++++++++++++ Marvin Task Mapping ++++++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function copyIfPresent(target, source, key) {
    if (source?.[key] != null && source[key] !== "") target[key] = source[key];
  }

  function buildAddTaskPayload(originalTask, spec, index) {
    const payload = {
      title: spec.title,
      done: false,
    };

    for (const field of ADD_TASK_FIELDS) copyIfPresent(payload, originalTask, field);
    if (typeof payload.rank === "number") payload.rank += index * 0.001;

    // Not documented for addTask, but cheap to pass through if this endpoint accepts it.
    if (spec.taskTime) payload.taskTime = spec.taskTime;
    if (originalTask.subtasks) payload.subtasks = originalTask.subtasks;

    return payload;
  }

  async function unrollTask(taskId, titleHint) {
    const originalTask = await readDocWithRetry(taskId);
    const loop = parseLoop(originalTask.title || titleHint, originalTask);
    if (!loop) return false;

    const [first, ...rest] = expandLoop(loop);
    if (!first) return false;

    showToast(`Unrolling into ${rest.length + 1} tasks...`);
    await updateOriginalTask(originalTask._id, first);

    for (let index = 0; index < rest.length; index += 1) {
      await addTask(buildAddTaskPayload(originalTask, rest[index], index + 1));
    }

    showToast(`Renamed original and created ${rest.length} more ${rest.length === 1 ? "task" : "tasks"}.`);
    return true;
  }

  /*
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   * ++++++++++++++++ Tampermonkey Event Handling +++++++++++++++
   * ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
   */

  function taskIdFromElement(taskElement) {
    return taskElement.getAttribute("data-item-id") || taskElement.querySelector("[data-uid]")?.getAttribute("data-uid") || "";
  }

  function taskTitleFromElement(taskElement) {
    return taskElement.querySelector(TITLE_SELECTOR)?.textContent?.trim() || "";
  }

  function handleAddedTask(taskElement) {
    const taskId = taskIdFromElement(taskElement);
    if (!taskId || processedTaskIds.has(taskId)) return;

    const title = taskTitleFromElement(taskElement);
    if (!LOOP_PATTERN.test(title)) return;

    processedTaskIds.add(taskId);
    unrollTask(taskId, title).catch((error) => {
      console.error("[Task Unroller]", error);
      showToast(error.message, true);
    });
  }

  function observeAddedTasks() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(TASK_SELECTOR)) handleAddedTask(node);
          node.querySelectorAll?.(TASK_SELECTOR).forEach(handleAddedTask);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  registerMenu();
  observeAddedTasks();

  window.AMTaskUnroller = {
    buildAddTaskPayload,
    expandLoop,
    parseDurationMillis,
    parseLoop,
    parseStoredTaskTime,
    parseTitleTime,
    unrollTask,
  };
})();
