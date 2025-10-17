// ========== UI 렌더링 최적화 모듈 ==========

// ========== Virtual Scrolling (단어장용) ==========
export class VirtualScroller {
    constructor(container, itemHeight, renderItem) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.items = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;

        this.viewport = document.createElement('div');
        this.viewport.style.overflow = 'auto';
        this.viewport.style.height = '100%';

        this.content = document.createElement('div');
        this.content.style.position = 'relative';

        this.viewport.appendChild(this.content);
        this.container.appendChild(this.viewport);

        // 스크롤 이벤트 (throttled)
        this.viewport.addEventListener('scroll', this.throttle(() => {
            this.handleScroll();
        }, 16)); // 60fps
    }

    setItems(items) {
        this.items = items;
        this.content.style.height = `${items.length * this.itemHeight}px`;
        this.handleScroll();
    }

    handleScroll() {
        this.scrollTop = this.viewport.scrollTop;
        const viewportHeight = this.viewport.clientHeight;

        this.visibleStart = Math.floor(this.scrollTop / this.itemHeight);
        this.visibleEnd = Math.ceil((this.scrollTop + viewportHeight) / this.itemHeight);

        // 버퍼 추가 (부드러운 스크롤)
        const buffer = 5;
        this.visibleStart = Math.max(0, this.visibleStart - buffer);
        this.visibleEnd = Math.min(this.items.length, this.visibleEnd + buffer);

        this.render();
    }

    render() {
        // 기존 아이템 제거
        this.content.innerHTML = '';

        // 보이는 범위만 렌더링
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const item = this.items[i];
            const element = this.renderItem(item, i);

            element.style.position = 'absolute';
            element.style.top = `${i * this.itemHeight}px`;
            element.style.width = '100%';
            element.style.height = `${this.itemHeight}px`;

            this.content.appendChild(element);
        }
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    destroy() {
        this.viewport.removeEventListener('scroll', this.handleScroll);
        this.container.removeChild(this.viewport);
    }
}

// ========== IntersectionObserver를 이용한 Lazy Loading ==========
export class LazyLoader {
    constructor(options = {}) {
        this.options = {
            root: null,
            rootMargin: '50px',
            threshold: 0.01,
            ...options
        };

        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            this.options
        );

        this.callbacks = new WeakMap();
    }

    observe(element, callback) {
        this.callbacks.set(element, callback);
        this.observer.observe(element);
    }

    unobserve(element) {
        this.observer.unobserve(element);
        this.callbacks.delete(element);
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const callback = this.callbacks.get(entry.target);
                if (callback) {
                    callback(entry.target);
                    // 한 번만 실행 후 관찰 중지
                    this.unobserve(entry.target);
                }
            }
        });
    }

    destroy() {
        this.observer.disconnect();
        this.callbacks = new WeakMap();
    }
}

// ========== DOM 업데이트 배칭 ==========
export class DOMBatcher {
    constructor() {
        this.pendingUpdates = [];
        this.scheduled = false;
    }

    schedule(updateFn) {
        this.pendingUpdates.push(updateFn);

        if (!this.scheduled) {
            this.scheduled = true;
            requestAnimationFrame(() => this.flush());
        }
    }

    flush() {
        // 읽기 작업 먼저 (레이아웃 thrashing 방지)
        const reads = this.pendingUpdates.filter(fn => fn.type === 'read');
        reads.forEach(fn => fn());

        // 쓰기 작업 나중에
        const writes = this.pendingUpdates.filter(fn => fn.type !== 'read');
        writes.forEach(fn => fn());

        this.pendingUpdates = [];
        this.scheduled = false;
    }
}

export const domBatcher = new DOMBatcher();

// ========== 애니메이션 최적화 (CSS Transform 사용) ==========
export function animateElement(element, properties, duration = 300) {
    return new Promise(resolve => {
        // will-change로 브라우저에 힌트 제공
        element.style.willChange = Object.keys(properties).join(', ');

        // CSS transition 적용
        element.style.transition = `all ${duration}ms ease-out`;

        // 속성 적용
        Object.assign(element.style, properties);

        setTimeout(() => {
            element.style.willChange = 'auto';
            element.style.transition = '';
            resolve();
        }, duration);
    });
}

// ========== 이미지 Lazy Loading ==========
export function lazyLoadImages(container) {
    const images = container.querySelectorAll('img[data-src]');
    const loader = new LazyLoader();

    images.forEach(img => {
        loader.observe(img, (target) => {
            target.src = target.dataset.src;
            target.removeAttribute('data-src');
            target.classList.add('loaded');
        });
    });

    return loader;
}

// ========== 메모리 누수 방지: 이벤트 리스너 관리 ==========
class EventManager {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(element, event, handler, options) {
        if (!this.listeners.has(element)) {
            this.listeners.set(element, []);
        }

        this.listeners.get(element).push({ event, handler, options });
        element.addEventListener(event, handler, options);
    }

    removeEventListener(element, event, handler) {
        element.removeEventListener(event, handler);

        if (this.listeners.has(element)) {
            const listeners = this.listeners.get(element);
            const index = listeners.findIndex(l => l.event === event && l.handler === handler);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    removeAllListeners(element) {
        if (this.listeners.has(element)) {
            const listeners = this.listeners.get(element);
            listeners.forEach(({ event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.listeners.delete(element);
        }
    }

    destroy() {
        this.listeners.forEach((listeners, element) => {
            listeners.forEach(({ event, handler }) => {
                element.removeEventListener(event, handler);
            });
        });
        this.listeners.clear();
    }
}

export const eventManager = new EventManager();

// ========== 렌더링 성능 측정 ==========
export class PerformanceMonitor {
    constructor() {
        this.marks = new Map();
    }

    start(label) {
        this.marks.set(label, performance.now());
    }

    end(label) {
        const startTime = this.marks.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
            this.marks.delete(label);
            return duration;
        }
        return 0;
    }

    measure(label, fn) {
        this.start(label);
        const result = fn();
        this.end(label);
        return result;
    }

    async measureAsync(label, fn) {
        this.start(label);
        const result = await fn();
        this.end(label);
        return result;
    }
}

export const perfMonitor = new PerformanceMonitor();
