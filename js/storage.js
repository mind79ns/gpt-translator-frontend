// ========== localStorage 비동기 래퍼 (성능 최적화) ==========
// UI 블로킹 방지를 위한 비동기 스토리지 유틸리티

export const AsyncStorage = {
    // 읽기 (Promise 기반)
    async getItem(key) {
        return new Promise((resolve) => {
            // requestIdleCallback으로 유휴 시간에 실행
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    resolve(localStorage.getItem(key));
                });
            } else {
                // Fallback: setTimeout으로 마이크로태스크 큐에 추가
                setTimeout(() => {
                    resolve(localStorage.getItem(key));
                }, 0);
            }
        });
    },

    // 쓰기 (Promise 기반)
    async setItem(key, value) {
        return new Promise((resolve) => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    localStorage.setItem(key, value);
                    resolve();
                });
            } else {
                setTimeout(() => {
                    localStorage.setItem(key, value);
                    resolve();
                }, 0);
            }
        });
    },

    // 삭제 (Promise 기반)
    async removeItem(key) {
        return new Promise((resolve) => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    localStorage.removeItem(key);
                    resolve();
                });
            } else {
                setTimeout(() => {
                    localStorage.removeItem(key);
                    resolve();
                }, 0);
            }
        });
    },

    // 동기식 읽기 (즉시 필요한 경우만 사용)
    getItemSync(key) {
        return localStorage.getItem(key);
    },

    // 동기식 쓰기 (즉시 필요한 경우만 사용)
    setItemSync(key, value) {
        localStorage.setItem(key, value);
    }
};

// ========== 디바운스 & 스로틀 유틸리티 ==========
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ========== 캐시 관리 ==========
class CacheManager {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key) {
        if (this.cache.has(key)) {
            // LRU: 접근 시 맨 뒤로 이동
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return null;
    }

    set(key, value) {
        // 이미 존재하면 삭제 후 재추가 (LRU)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // 크기 초과 시 가장 오래된 항목 제거
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }
}

export const translationCache = new CacheManager(100);
export const apiCache = new CacheManager(50);
