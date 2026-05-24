var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SimplyScrollPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
function around(obj, factories) {
  const removers = Object.keys(factories).map((key) => {
    const original = obj[key];
    const factory = factories[key];
    const wrapped = factory(original);
    wrapped && (wrapped.container = original);
    obj[key] = wrapped;
    return () => {
      if (obj[key] === wrapped) obj[key] = original;
    };
  });
  return () => removers.forEach((r) => r());
}
var SimplyScrollPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.data = {};
    this.scrollDebouncers = /* @__PURE__ */ new WeakMap();
  }
  async onload() {
    await this.loadAndCleanData();
    const plugin = this;
    const styleEl = document.createElement("style");
    styleEl.id = "simply-scroll-cursor-hider";
    styleEl.textContent = `
            .simply-scroll-cloaked .cm-cursorLayer,
            .simply-scroll-cloaked .cm-selectionLayer {
                display: none !important;
                opacity: 0 !important;
            }
            .simply-scroll-cloaked {
                caret-color: transparent !important;
            }
        `;
    document.head.appendChild(styleEl);
    const unpatch = around(import_obsidian.WorkspaceLeaf.prototype, {
      setViewState(next) {
        return async function(state, eState) {
          if (state.type === "markdown" && state.state?.file) {
            const path = state.state.file;
            const saved = plugin.data[path];
            if (saved > 0 && (!state.state || !state.state.subpath)) {
              const leaf = this;
              eState = Object.assign({}, eState || {});
              eState.scroll = saved;
              delete eState.line;
              delete eState.cursor;
              eState.focus = false;
              const contentEl = leaf.view?.contentEl;
              let isCloaked = false;
              if (contentEl) {
                contentEl.style.transition = "none";
                contentEl.style.opacity = "0";
                leaf.view.containerEl.classList.add("simply-scroll-cloaked");
                isCloaked = true;
              }
              const restoreUI = () => {
                if (!isCloaked) return;
                isCloaked = false;
                if (leaf.view?.contentEl) {
                  leaf.view.containerEl.classList.remove("simply-scroll-cloaked");
                  leaf.view.contentEl.style.transition = "opacity 0.05s ease-out";
                  leaf.view.contentEl.style.opacity = "1";
                  setTimeout(() => {
                    if (leaf.view?.contentEl?.style.opacity === "1") {
                      leaf.view.contentEl.style.transition = "";
                      leaf.view.contentEl.style.opacity = "";
                    }
                  }, 100);
                }
              };
              try {
                const result = await next.call(this, state, eState);
                if (contentEl) {
                  const startTime = Date.now();
                  const fightDuration = 100;
                  const fightInterval = setInterval(() => {
                    const activeEl = document.activeElement;
                    if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                      activeEl.blur();
                    }
                    if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                      leaf.view.currentMode.applyScroll(saved);
                    }
                    if (Date.now() - startTime >= fightDuration) {
                      clearInterval(fightInterval);
                      restoreUI();
                    }
                  }, 5);
                  setTimeout(() => {
                    clearInterval(fightInterval);
                    restoreUI();
                  }, 200);
                } else {
                  restoreUI();
                }
                return result;
              } catch (error) {
                restoreUI();
                throw error;
              }
            }
          }
          return next.call(this, state, eState);
        };
      }
    });
    this.register(unpatch);
    this.requestDiskSave = (0, import_obsidian.debounce)(() => {
      this.saveData(this.data);
    }, 2e3);
    this.registerDomEvent(window, "scroll", (e) => {
      const target = e.target;
      if (target.classList && (target.classList.contains("cm-scroller") || target.classList.contains("markdown-reading-view") || target.classList.contains("markdown-preview-view"))) {
        let debouncer = this.scrollDebouncers.get(target);
        if (!debouncer) {
          debouncer = (0, import_obsidian.debounce)(() => {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of leaves) {
              if (leaf.view && leaf.view.containerEl.contains(target)) {
                const file = leaf.view.file;
                if (file) {
                  const scroll = leaf.view.currentMode?.getScroll?.();
                  if (typeof scroll === "number") {
                    this.data[file.path] = scroll;
                    this.requestDiskSave();
                  }
                }
                break;
              }
            }
          }, 300);
          this.scrollDebouncers.set(target, debouncer);
        }
        debouncer();
      }
    }, true);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.saveData(this.data);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof import_obsidian.TFile && this.data[oldPath] !== void 0) {
          this.data[file.path] = this.data[oldPath];
          delete this.data[oldPath];
          this.saveData(this.data);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof import_obsidian.TFile && this.data[file.path] !== void 0) {
          delete this.data[file.path];
          this.saveData(this.data);
        }
      })
    );
  }
  async loadAndCleanData() {
    const loadedData = await this.loadData() || {};
    this.data = Object.assign({}, loadedData);
    this.app.workspace.onLayoutReady(() => {
      let isDirty = false;
      const existingPaths = new Set(this.app.vault.getFiles().map((f) => f.path));
      for (const path in this.data) {
        if (!existingPaths.has(path)) {
          delete this.data[path];
          isDirty = true;
        }
      }
      if (isDirty) {
        this.saveData(this.data);
        console.log("Simply Scroll: Cleaned up orphaned scroll data.");
      }
    });
  }
  async onunload() {
    const styleEl = document.getElementById("simply-scroll-cursor-hider");
    if (styleEl) styleEl.remove();
    if (this.requestDiskSave && this.requestDiskSave.cancel) {
      this.requestDiskSave.cancel();
    }
    await this.saveData(this.data);
    console.log("Simply Scroll Unloaded");
  }
};
