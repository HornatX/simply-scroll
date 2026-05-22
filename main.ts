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
// 类型声明增强 (处理 Obsidian 未公开的内部 API)
// ============================================================================

// ============================================================================
// 类型声明增强 (处理 Obsidian 未公开的内部 API)
// ============================================================================

interface ExtendedView extends View {
    contentEl?: HTMLElement;
    file?: TFile | null;    // <=== 新增这一行：告诉 TS view 身上可能会有 file 属性
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

        // --- 第一部分：终极隐身斗篷策略 (优化版) ---
        const unpatch = around(WorkspaceLeaf.prototype, {
            setViewState(next: Function) {
                return async function (this: ExtendedWorkspaceLeaf, state: ViewState, eState?: any) {
                    if (state.type === 'markdown' && state.state?.file) {
                        const path = state.state.file as string;
                        const saved = plugin.data[path];

                        // 非跳转且有保存数据时介入
                        if (saved > 5 && (!state.state || !state.state.subpath)) {
                            const leaf = this;
                            eState = Object.assign({}, eState || {}); 
                            eState.scroll = saved;
                            delete eState.line;
                            delete eState.cursor;
                            eState.focus = false;

                            const contentEl = leaf.view?.contentEl;
                            let isCloaked = false;

                            // 🌟 1. 挂载隐身斗篷
                            if (contentEl) {
                                contentEl.style.transition = 'none';
                                contentEl.style.opacity = '0';
                                isCloaked = true;
                            }

                            // 安全恢复 UI 的闭包函数，防止卡死
                            const restoreUI = () => {
                                if (!isCloaked) return;
                                isCloaked = false;
                                
                                if (leaf.view?.contentEl) {
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

                                // 🌟 2. 极速镇压（修复原版次数计算错误，改为精准的 70ms 时间控制）
                                if (contentEl) {
                                    const startTime = Date.now();
                                    const fightDuration = 40; // 维持 40 毫秒的压制期
                                    
                                    const fightInterval = setInterval(() => {
                                        // 没收焦点
                                        const activeEl = document.activeElement as HTMLElement | null;
                                        if (activeEl && leaf.view.containerEl.contains(activeEl)) {
                                            activeEl.blur();
                                        }
                                        
                                        // 持续按住滚轮
                                        if (leaf.view.currentMode && leaf.view.currentMode.applyScroll) {
                                            leaf.view.currentMode.applyScroll(saved);
                                        }
                                        
                                        // 🌟 3. 时间到达后立刻撤退并恢复 UI
                                        if (Date.now() - startTime >= fightDuration) { 
                                            clearInterval(fightInterval);
                                            restoreUI();
                                        }
                                    }, 5);

                                    // 🌟 绝对保底机制：如果浏览器暂停了 interval，150ms 后强制解开斗篷
                                    setTimeout(() => {
                                        clearInterval(fightInterval);
                                        restoreUI();
                                    }, 150);
                                } else {
                                    restoreUI();
                                }

                                return result;

                            } catch (error) {
                                // 🌟 异常拦截：即便底层逻辑报错，也保证白板不卡死
                                restoreUI();
                                throw error; 
                            }
                        }
                    }
                    return next.call(this, state, eState);
                };
            }
        });

        // 🌟 修复严重 Bug：注册反劫持函数，确保插件更新/禁用时不引发内存泄漏
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
                        // 🌟 DOM 查找优化：先找共同的父节点范围，再遍历
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
        // 由于 Obsidian 的 debounce 返回类型并不总是显式声明 cancel 方法，
        // 这里使用 any 断言以跳过 ts 的严格检测
        if (this.requestDiskSave && (this.requestDiskSave as any).cancel) {
            (this.requestDiskSave as any).cancel();
        }
        await this.saveData(this.data);
        console.log('Simply Scroll Unloaded');
    }
}