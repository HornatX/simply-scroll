import { 
    Plugin, 
    WorkspaceLeaf, 
    debounce, 
    ViewState, 
    TAbstractFile, 
    TFile, 
    View 
} from 'obsidian';

// ============================================================================
// 类型声明增强 
// ============================================================================

interface ExtendedView extends View {
    contentEl?: HTMLElement;
    file?: TFile | null;
    currentMode?: {
        applyScroll?: (scroll: number) => void;
        getScroll?: () => number;
    };
}

interface ExtendedWorkspaceLeaf extends WorkspaceLeaf {
    view: ExtendedView;
}

interface SimplyScrollData {
    [path: string]: number;
}

// ============================================================================
// 劫持函数 (Monkey Patch)
// ============================================================================

function around(obj: any, factories: any): () => void {
    const removers = Object.keys(factories).map(key => {
        const original = obj[key];
        const factory = factories[key];
        const wrapped = factory(original);
        wrapped && (wrapped.container = original);
        obj[key] = wrapped;
        return () => { if (obj[key] === wrapped) obj[key] = original; };
    });
    return () => removers.forEach(r => r());
}

// ============================================================================
// 插件主类
// ============================================================================

export default class SimplyScrollPlugin extends Plugin {
    data: SimplyScrollData = {};
    scrollDebouncers: WeakMap<HTMLElement, () => void> = new WeakMap();
    requestDiskSave!: ReturnType<typeof debounce>;
    
    // 状态标记：用来区分是“冷启动”还是“日常切换”
    isAppReady: boolean = false; 

    async onload() {
        await this.loadAndCleanData();
        const plugin = this;

        // 监听应用真正加载完毕，切换为“日常极速模式”
        this.app.workspace.onLayoutReady(() => {
            this.isAppReady = true;
        });

        // 🌟 动态注入 CSS
        const styleEl = document.createElement('style');
        styleEl.id = 'simply-scroll-cursor-hider';
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

        // --- 第一部分：终极隐身斗篷策略 (双轨分支版) ---
        const unpatch = around(WorkspaceLeaf.prototype, {
            setViewState(next: Function) {
                return async function (this: ExtendedWorkspaceLeaf, state: ViewState, eState?: any) {
                    if (state.type === 'markdown' && state.state?.file) {
                        const path = state.state.file as string;
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

                            // 1. 统一挂载隐身斗篷
                            if (contentEl) {
                                contentEl.style.transition = 'none';
                                contentEl.style.opacity = '0';
                                leaf.view.containerEl.classList.add('simply-scroll-cloaked');
                                isCloaked = true;
                            }

                            const restoreUI = () => {
                                if (!isCloaked) return;
                                isCloaked = false;
                                if (leaf.view?.contentEl) {
                                    leaf.view.containerEl.classList.remove('simply-scroll-cloaked');
                                    leaf.view.contentEl.style.transition = 'opacity 0.05s ease-out';
                                    leaf.view.contentEl.style.opacity = '1';
                                    setTimeout(() => {
                                        if (leaf.view?.contentEl?.style.opacity === '1') {
                                            leaf.view.contentEl.style.transition = '';
                                            leaf.view.contentEl.style.opacity = '';
                                        }
                                    }, 100);
                                }
                            };

                            try {
                                // 执行原生的打开逻辑
                                const result = await next.call(this, state, eState);

                                // 🌟 2. 核心分支：区分冷启动与日常切换
                                if (contentEl) {
                                    const startTime = Date.now();

                                    if (!plugin.isAppReady) {
                                        // =====================================================
                                        // 🚀 分支 A：冷启动（重启）逻辑 - 长效镇压防止偏移
                                        // =====================================================
                                        const fightDuration = 600; 
                                        let animationFrameId: number;

                                        const fightLoop = () => {
                                            const elapsed = Date.now() - startTime;
                                            
                                            const activeEl = document.activeElement as HTMLElement | null;
                                            if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                                                activeEl.blur();
                                            }
                                            
                                            if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                                                leaf.view.currentMode.applyScroll(saved);
                                            }

                                            if (elapsed < fightDuration) {
                                                animationFrameId = requestAnimationFrame(fightLoop);
                                            } else {
                                                if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                                                    leaf.view.currentMode.applyScroll(saved);
                                                }
                                                cancelAnimationFrame(animationFrameId);
                                                restoreUI();
                                            }
                                        };
                                        animationFrameId = requestAnimationFrame(fightLoop);

                                    } else {
                                        // =====================================================
                                        // ⚡️ 分支 B：日常切换逻辑 - 恢复最初原版的高速 setInterval
                                        // =====================================================
                                        const fightDuration = 20; 
                                        const fightInterval = setInterval(() => {
                                            const activeEl = document.activeElement as HTMLElement | null;
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

                                        // 绝对保底机制
                                        setTimeout(() => {
                                            clearInterval(fightInterval);
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

        this.register(unpatch);

        // --- 第二部分：精准识别与高性能保存逻辑 ---
        this.requestDiskSave = debounce(() => {
            this.saveData(this.data);
        }, 2000);

        this.registerDomEvent(window, 'scroll', (e: Event) => {
            const target = e.target as HTMLElement;
            
            if (target.classList && (
                target.classList.contains('cm-scroller') || 
                target.classList.contains('markdown-reading-view') || 
                target.classList.contains('markdown-preview-view')
            )) {
                let debouncer = this.scrollDebouncers.get(target);
                
                if (!debouncer) {
                    debouncer = debounce(() => {
                        const leaves = this.app.workspace.getLeavesOfType('markdown') as ExtendedWorkspaceLeaf[];
                        for (const leaf of leaves) {
                            if (leaf.view && leaf.view.containerEl.contains(target)) {
                                const file = leaf.view.file;
                                if (file) {
                                    const scroll = leaf.view.currentMode?.getScroll?.();
                                    if (typeof scroll === 'number'){
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

        // --- 第三部分：生命周期与数据管理 ---
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.saveData(this.data);
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile && this.data[oldPath] !== undefined) {
                    this.data[file.path] = this.data[oldPath];
                    delete this.data[oldPath];
                    this.saveData(this.data);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file: TAbstractFile) => {
                if (file instanceof TFile && this.data[file.path] !== undefined) {
                    delete this.data[file.path];
                    this.saveData(this.data);
                }
            })
        );
    }

    async loadAndCleanData() {
        const loadedData = (await this.loadData()) || {};
        this.data = Object.assign({}, loadedData);

        this.app.workspace.onLayoutReady(() => {
            let isDirty = false;
            const existingPaths = new Set(this.app.vault.getFiles().map(f => f.path));
            
            for (const path in this.data) {
                if (!existingPaths.has(path)) {
                    delete this.data[path];
                    isDirty = true;
                }
            }
            
            if (isDirty) {
                this.saveData(this.data);
                console.log('Simply Scroll: Cleaned up orphaned scroll data.');
            }
        });
    }

    async onunload() {
        // 清理注入的 CSS
        const styleEl = document.getElementById('simply-scroll-cursor-hider');
        if (styleEl) styleEl.remove();

        if (this.requestDiskSave && (this.requestDiskSave as any).cancel) {
            (this.requestDiskSave as any).cancel();
        }
        await this.saveData(this.data);
        console.log('Simply Scroll Unloaded');
    }
}