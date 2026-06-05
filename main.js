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
    const k = key;
    const original = obj[k];
    const factory = factories[k];
    if (!factory) return () => {
    };
    const wrapped = factory(original);
    wrapped.container = original;
    obj[k] = wrapped;
    return () => {
      if (obj[k] === wrapped) obj[k] = original;
    };
  });
  return () => removers.forEach((r) => r());
}
var SimplyScrollPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.data = {};
    this.scrollDebouncers = /* @__PURE__ */ new WeakMap();
    // 状态标记：用来区分是“冷启动”还是“日常切换”
    this.isAppReady = false;
  }
  async onload() {
    await this.loadAndCleanData();
    this.app.workspace.onLayoutReady(() => {
      this.isAppReady = true;
    });
    this.setupMonkeyPatch(this);
    this.requestDiskSave = (0, import_obsidian.debounce)(() => {
      void this.saveData(this.data);
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
        void this.saveData(this.data);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof import_obsidian.TFile && this.data[oldPath] !== void 0) {
          this.data[file.path] = this.data[oldPath];
          delete this.data[oldPath];
          void this.saveData(this.data);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof import_obsidian.TFile && this.data[file.path] !== void 0) {
          delete this.data[file.path];
          void this.saveData(this.data);
        }
      })
    );
  }
  setupMonkeyPatch(plugin) {
    const unpatch = around(import_obsidian.WorkspaceLeaf.prototype, {
      setViewState(next) {
        return async function(state, eState) {
          if (state.type === "markdown" && state.state?.file) {
            const path = state.state.file;
            const saved = plugin.data[path];
            if (typeof saved === "number" && saved > 0 && (!state.state || !state.state.subpath)) {
              const leaf = this;
              const modState = Object.assign({}, eState || {});
              modState.scroll = saved;
              delete modState.line;
              delete modState.cursor;
              modState.focus = false;
              const contentEl = leaf.view?.contentEl;
              let isCloaked = false;
              if (contentEl) {
                contentEl.classList.remove("simply-scroll-showing");
                contentEl.classList.add("simply-scroll-hiding");
                leaf.view.containerEl.classList.add("simply-scroll-cloaked");
                isCloaked = true;
              }
              const restoreUI = () => {
                if (!isCloaked) return;
                isCloaked = false;
                if (leaf.view?.contentEl) {
                  leaf.view.containerEl.classList.remove("simply-scroll-cloaked");
                  leaf.view.contentEl.classList.remove("simply-scroll-hiding");
                  leaf.view.contentEl.classList.add("simply-scroll-showing");
                  window.setTimeout(() => {
                    if (leaf.view?.contentEl) {
                      leaf.view.contentEl.classList.remove("simply-scroll-showing");
                    }
                  }, 100);
                }
              };
              try {
                const result = await next.call(this, state, modState);
                if (contentEl) {
                  const startTime = Date.now();
                  const leafDoc = leaf.view.containerEl.ownerDocument;
                  if (!plugin.isAppReady) {
                    const fightDuration = 600;
                    let animationFrameId;
                    const fightLoop = () => {
                      const elapsed = Date.now() - startTime;
                      const activeEl = leafDoc.activeElement;
                      if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                        activeEl.blur();
                      }
                      if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                        leaf.view.currentMode.applyScroll(saved);
                      }
                      if (elapsed < fightDuration) {
                        animationFrameId = window.requestAnimationFrame(fightLoop);
                      } else {
                        if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                          leaf.view.currentMode.applyScroll(saved);
                        }
                        window.cancelAnimationFrame(animationFrameId);
                        restoreUI();
                      }
                    };
                    animationFrameId = window.requestAnimationFrame(fightLoop);
                  } else {
                    const fightDuration = 20;
                    const fightInterval = window.setInterval(() => {
                      const activeEl = leafDoc.activeElement;
                      if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                        activeEl.blur();
                      }
                      if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                        leaf.view.currentMode.applyScroll(saved);
                      }
                      if (Date.now() - startTime >= fightDuration) {
                        window.clearInterval(fightInterval);
                        restoreUI();
                      }
                    }, 5);
                    window.setTimeout(() => {
                      window.clearInterval(fightInterval);
                      restoreUI();
                    }, 200);
                  }
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
    plugin.register(unpatch);
  }
  async loadAndCleanData() {
    const loadedData = await this.loadData() || {};
    this.data = Object.assign({}, loadedData);
    this.app.workspace.onLayoutReady(() => {
      let isDirty = false;
      for (const path in this.data) {
        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        if (!(abstractFile instanceof import_obsidian.TFile)) {
          delete this.data[path];
          isDirty = true;
        }
      }
      if (isDirty) {
        void this.saveData(this.data);
        console.log("Simply Scroll: Cleaned up orphaned scroll data.");
      }
    });
  }
  // 修复 unload 生命周期返回值类型异常
  onunload() {
    const debouncer = this.requestDiskSave;
    if (debouncer && typeof debouncer.cancel === "function") {
      debouncer.cancel();
    }
    void this.saveData(this.data);
    console.log("Simply Scroll Unloaded");
  }
};
