// ==UserScript==
// @name         Amazing Marvin - Toggle All Subtasks of Selected Task
// @namespace    https://app.amazingmarvin.com/
// @version      1.0.0
// @description  Adds Alt+Shift+D to check off every visible subtask under the selected Amazing Marvin task; if all are already checked, it unchecks them.
// @author       Raj Piskala
// @match        https://app.amazingmarvin.com/*
// @match        https://amazingmarvin.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SHORTCUT_LABEL = "Alt+Shift+D";

  const SELECTORS = {
    taskItem: '[data-item-type="task"]',
    subtaskItem: '[data-item-type="subtask"]',
    selectedTask: ".Task-selected",
    checkbox: '.Checkbox, [role="checkbox"], input[type="checkbox"]',
  };

  function isShortcut(event) {
    return (
      event.key.toLowerCase() === "d" &&
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
    );
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest("input, textarea, select")) return true;
    return Boolean(target.closest('[contenteditable="true"], [role="textbox"]'));
  }

  function getSelectedTaskItems() {
    const activeTask = document.activeElement?.closest?.(SELECTORS.taskItem);
    if (activeTask) return [activeTask];

    const selected = Array.from(document.querySelectorAll(SELECTORS.selectedTask))
      .map((task) => task.closest(SELECTORS.taskItem))
      .filter(Boolean);

    return Array.from(new Set(selected));
  }

  function getCheckboxState(element) {
    if (element.matches?.('input[type="checkbox"]')) {
      if (element.disabled) return null;
      return element.checked;
    }

    const ariaChecked = element.getAttribute("aria-checked");
    if (ariaChecked != null) return ariaChecked === "true";

    const className = element.className || "";
    if (/\bCheckbox-checked\b/.test(className)) return true;
    if (/\bCheckbox-unchecked\b/.test(className)) return false;

    return null;
  }

  function isUncheckedCheckbox(element) {
    return getCheckboxState(element) === false;
  }

  function getSubtaskCheckboxes(taskItem) {
    return Array.from(taskItem.querySelectorAll(SELECTORS.subtaskItem))
      .map((subtask) =>
        Array.from(subtask.querySelectorAll(SELECTORS.checkbox)).find(
          (checkbox) => getCheckboxState(checkbox) != null,
        ),
      )
      .filter(Boolean);
  }

  function getUncheckedSubtaskCheckboxes(taskItem) {
    return getSubtaskCheckboxes(taskItem).filter(isUncheckedCheckbox);
  }

  function clickCheckbox(checkbox) {
    checkbox.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }

  function checkAllSubtasksOfSelectedTasks() {
    const taskItems = getSelectedTaskItems();
    if (taskItems.length === 0) {
      return {
        ok: false,
        reason: "No selected task found.",
        checkedCount: 0,
        taskCount: 0,
      };
    }

    const allCheckboxes = Array.from(
      new Set(taskItems.flatMap(getSubtaskCheckboxes)),
    );
    const uncheckedCheckboxes = allCheckboxes.filter(isUncheckedCheckbox);
    const shouldUncheck = allCheckboxes.length > 0 && uncheckedCheckboxes.length === 0;
    const targetCheckboxes = shouldUncheck ? allCheckboxes : uncheckedCheckboxes;

    targetCheckboxes.forEach(clickCheckbox);

    return {
      ok: true,
      action: shouldUncheck ? "unchecked" : "checked",
      changedCount: targetCheckboxes.length,
      totalSubtaskCount: allCheckboxes.length,
      taskCount: taskItems.length,
    };
  }

  function showToast(message) {
    const existing = document.getElementById("am-check-subtasks-toast");
    existing?.remove();

    const toast = document.createElement("div");
    toast.id = "am-check-subtasks-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      padding: "10px 12px",
      borderRadius: "6px",
      background: "rgba(38, 38, 38, 0.94)",
      color: "#fff",
      font: "13px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.22)",
      pointerEvents: "none",
    });

    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  function describeResult(result) {
    if (!result.ok) return `${result.reason} (${SHORTCUT_LABEL})`;
    if (result.totalSubtaskCount === 0) return "No subtasks found.";
    if (result.changedCount === 0) return "No subtask changes needed.";
    const subtaskText = result.changedCount === 1 ? "subtask" : "subtasks";
    const taskText = result.taskCount === 1 ? "task" : "tasks";
    const actionText = result.action === "unchecked" ? "Unchecked" : "Checked";
    return `${actionText} ${result.changedCount} ${subtaskText} in ${result.taskCount} selected ${taskText}.`;
  }

  function handleKeydown(event) {
    if (!isShortcut(event) || isEditableTarget(event.target)) return;

    const result = checkAllSubtasksOfSelectedTasks();
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast(describeResult(result));
  }

  document.addEventListener("keydown", handleKeydown, true);

  window.AMCheckSubtasks = {
    checkAll: checkAllSubtasksOfSelectedTasks,
    findSelectedTasks: getSelectedTaskItems,
    findSubtaskCheckboxes: getSubtaskCheckboxes,
    findUncheckedSubtaskCheckboxes: getUncheckedSubtaskCheckboxes,
    shortcut: SHORTCUT_LABEL,
  };
})();
