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

    async onload() {
        await this.loadAndCleanData();
        const plugin = this;

        // 🌟 核心改进 1：动态注入 CSS，用于在加载瞬间彻底隐藏光标
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

        // --- 第一部分：终极隐身斗篷策略 (针对光标抢夺优化版) ---
        const unpatch = around(WorkspaceLeaf.prototype, {
            setViewState(next: Function) {
                return async function (this: ExtendedWorkspaceLeaf, state: ViewState, eState?: any) {
                    if (state.type === 'markdown' && state.state?.file) {
                        const path = state.state.file as string;
                        const saved = plugin.data[path];

                        // 🌟 核心改进 2：将 saved > 5 改为 saved > 0。打破前几行不记录的魔咒！
                        if (saved > 0 && (!state.state || !state.state.subpath)) {
                            const leaf = this;
                            eState = Object.assign({}, eState || {}); 
                            eState.scroll = saved;
                            delete eState.line;
                            delete eState.cursor;
                            eState.focus = false; // 告诉 Obsidian 不要聚焦

                            const contentEl = leaf.view?.contentEl;
                            let isCloaked = false;

                            // 🌟 1. 挂载隐身斗篷 & 隐藏光标
                            if (contentEl) {
                                contentEl.style.transition = 'none';
                                contentEl.style.opacity = '0';
                                // 添加类名，触发刚才注入的 CSS，瞬间抹除光标
                                leaf.view.containerEl.classList.add('simply-scroll-cloaked');
                                isCloaked = true;
                            }

                            // 安全恢复 UI 的闭包函数，防止卡死
                            const restoreUI = () => {
                                if (!isCloaked) return;
                                isCloaked = false;
                                
                                if (leaf.view?.contentEl) {
                                    // 撤销光标隐藏
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

                                // 🌟 2. 极速镇压（针对 CodeMirror 延迟渲染优化）
                                if (contentEl) {
                                    const startTime = Date.now();
                                    // 🌟 核心改进 3：将压制时间从 40ms 延长至 100ms
                                    // 因为 CodeMirror 渲染文本和计算光标有延迟，多按住一会防止它反扑
                                    const fightDuration = 20; 
                                    
                                    const fightInterval = setInterval(() => {
                                        // 疯狂没收焦点，只要光标拿不到焦点，它就无法强制滚动视口
                                        const activeEl = document.activeElement as HTMLElement | null;
                                        if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                                            activeEl.blur();
                                        }
                                        
                                        // 持续应用我们保存的滚动条位置
                                        if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                                            leaf.view.currentMode.applyScroll(saved);
                                        }
                                        
                                        // 时间到达后立刻撤退并恢复 UI
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