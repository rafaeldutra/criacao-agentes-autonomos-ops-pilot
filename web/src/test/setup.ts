import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement the modal API of <dialog>; emulate the parts the app uses.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

// jsdom lacks scrollTo on elements.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo() {};
}

// axe-core probes canvas for icon ligatures; jsdom has no canvas, so answer "unsupported" quietly.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(() => {
  if (typeof document === "undefined") return; // node-environment tests
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.clear();
  } catch {
    // storage may be stubbed by a test
  }
});
