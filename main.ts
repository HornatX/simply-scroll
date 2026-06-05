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
// 类型声明增强 (修复 Any 和类型不明确警告)
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

// 修复 eState 的 any 警告
interface EphemeralState {
    scroll?: number;
    line?: number;
    cursor?: unknown;
    focus?: boolean;
    [key: string]: unknown;
}

// 修复 debounce cancel 的类型警告
interface CancelableDebounce {
    cancel?: () => void;
}

// 通用函数类型声明
type AnyFunction = (...args: unknown[]) => unknown;

// ============================================================================
// 劫持函数 (Monkey Patch) - 修复类型警告
// ============================================================================

function around<T extends Record<string, unknown>>(
    obj: T,
    factories: { [K in keyof T]?: (next: AnyFunction) => AnyFunction }
): () => void {
    const removers = Object.keys(factories).map(key => {
        const k = key as keyof T;
        const original = obj[k] as AnyFunction;
        const factory = factories[k];
        if (!factory) return () => {};
        
        const wrapped = factory(original) as AnyFunction & { container?: AnyFunction };
        wrapped.container = original;
        
        obj[k] = wrapped as T[keyof T];
        return () => { 
            if (obj[k] === wrapped) obj[k] = original as T[keyof T]; 
        };
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

    async onload(): Promise<void> {
        await this.loadAndCleanData();

        // 监听应用真正加载完毕，切换为“日常极速模式”
        this.app.workspace.onLayoutReady(() => {
            this.isAppReady = true;
        });

        // 将插件实例传入闭包，避免 linter 警告 (Unexpected aliasing of 'this')
        this.setupMonkeyPatch(this);

        // --- 第二部分：精准识别与高性能保存逻辑 ---
        this.requestDiskSave = debounce(() => {
            // 修复 Promise 未处理警告
            void this.saveData(this.data);
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
                void this.saveData(this.data);
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile && this.data[oldPath] !== undefined) {
                    this.data[file.path] = this.data[oldPath];
                    delete this.data[oldPath];
                    void this.saveData(this.data);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file: TAbstractFile) => {
                if (file instanceof TFile && this.data[file.path] !== undefined) {
                    delete this.data[file.path];
                    void this.saveData(this.data);
                }
            })
        );
    }

    private setupMonkeyPatch(plugin: SimplyScrollPlugin) {
        const unpatch = around(WorkspaceLeaf.prototype as Record<string, unknown>, {
            setViewState(next: AnyFunction) {
                return async function (this: ExtendedWorkspaceLeaf, state: ViewState, eState?: EphemeralState) {
                    if (state.type === 'markdown' && state.state?.file) {
                        const path = state.state.file as string;
                        const saved = plugin.data[path];

                        if (typeof saved === 'number' && saved > 0 && (!state.state || !state.state.subpath)) {
                            const leaf = this;
                            const modState: EphemeralState = Object.assign({}, eState || {}); 
                            modState.scroll = saved;
                            delete modState.line;
                            delete modState.cursor;
                            modState.focus = false;

                            const contentEl = leaf.view?.contentEl;
                            let isCloaked = false;

                            // 1. 统一挂载隐身斗篷 (使用 Class 替代直接赋值 Style)
                            if (contentEl) {
                                contentEl.classList.remove('simply-scroll-showing');
                                contentEl.classList.add('simply-scroll-hiding');
                                leaf.view.containerEl.classList.add('simply-scroll-cloaked');
                                isCloaked = true;
                            }

                            const restoreUI = () => {
                                if (!isCloaked) return;
                                isCloaked = false;
                                if (leaf.view?.contentEl) {
                                    leaf.view.containerEl.classList.remove('simply-scroll-cloaked');
                                    leaf.view.contentEl.classList.remove('simply-scroll-hiding');
                                    leaf.view.contentEl.classList.add('simply-scroll-showing');
                                    
                                    // 修复 setTimeout 的 window 前缀警告
                                    window.setTimeout(() => {
                                        if (leaf.view?.contentEl) {
                                            leaf.view.contentEl.classList.remove('simply-scroll-showing');
                                        }
                                    }, 100);
                                }
                            };

                            try {
                                // 执行原生的打开逻辑
                                const result = await (next.call(this, state, modState) as Promise<unknown>);

                                // 2. 核心分支：区分冷启动与日常切换
                                if (contentEl) {
                                    const startTime = Date.now();
                                    
                                    // 修复弹出窗口(popout window)兼容性警告，使用 ownerDocument 替代全局 document
                                    const leafDoc = leaf.view.containerEl.ownerDocument;

                                    if (!plugin.isAppReady) {
                                        // 分支 A：冷启动（重启）逻辑
                                        const fightDuration = 600; 
                                        let animationFrameId: number;

                                        const fightLoop = () => {
                                            const elapsed = Date.now() - startTime;
                                            
                                            const activeEl = leafDoc.activeElement as HTMLElement | null;
                                            if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                                                activeEl.blur();
                                            }
                                            
                                            if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                                                leaf.view.currentMode.applyScroll(saved);
                                            }

                                            if (elapsed < fightDuration) {
                                                // 修复 requestAnimationFrame 的 window 前缀警告
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
                                        // 分支 B：日常切换逻辑
                                        const fightDuration = 20; 
                                        // 修复 setInterval 的 window 前缀警告
                                        const fightInterval = window.setInterval(() => {
                                            const activeEl = leafDoc.activeElement as HTMLElement | null;
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

                                        // 绝对保底机制
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

    async loadAndCleanData(): Promise<void> {
        const loadedData = (await this.loadData()) || {};
        this.data = Object.assign({}, loadedData);

        this.app.workspace.onLayoutReady(() => {
            let isDirty = false;
            
            // 修复 Vault Enumeration 性能建议：
            // 不再扫描全库文件 (vault.getFiles)，改为按需验证 data 中的文件是否仍存在
            for (const path in this.data) {
                const abstractFile = this.app.vault.getAbstractFileByPath(path);
                if (!(abstractFile instanceof TFile)) {
                    delete this.data[path];
                    isDirty = true;
                }
            }
            
            if (isDirty) {
                void this.saveData(this.data);
                console.log('Simply Scroll: Cleaned up orphaned scroll data.');
            }
        });
    }

    // 修复 unload 生命周期返回值类型异常
    onunload(): void {
        const debouncer = this.requestDiskSave as unknown as CancelableDebounce;
        if (debouncer && typeof debouncer.cancel === 'function') {
            debouncer.cancel();
        }
        
        // 生命周期内结束不需 await
        void this.saveData(this.data);
        console.log('Simply Scroll Unloaded');
    }
}