// ========== API 요청 최적화 모듈 ==========
import { apiCache } from './storage.js';

const API_URL = 'https://knstranslator.netlify.app/.netlify/functions/translate';
const AUTH_API_URL = 'https://knstranslator.netlify.app/.netlify/functions/auth';

// ========== 요청 큐 관리 (배칭 지원) ==========
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.batchSize = 5;
        this.batchDelay = 50; // ms
    }

    async add(requestFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            // 배치 크기만큼 가져오기
            const batch = this.queue.splice(0, this.batchSize);

            // 병렬 실행
            await Promise.allSettled(
                batch.map(async ({ requestFn, resolve, reject }) => {
                    try {
                        const result = await requestFn();
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                })
            );

            // 배치 간 딜레이 (서버 부하 방지)
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.batchDelay));
            }
        }

        this.processing = false;
    }
}

export const requestQueue = new RequestQueue();

// ========== 중복 요청 방지 ==========
const pendingRequests = new Map();

export async function dedupeRequest(key, requestFn) {
    // 이미 진행 중인 요청이 있으면 재사용
    if (pendingRequests.has(key)) {
        console.log(`[API] 중복 요청 감지, 기존 요청 재사용: ${key}`);
        return pendingRequests.get(key);
    }

    const promise = requestFn().finally(() => {
        pendingRequests.delete(key);
    });

    pendingRequests.set(key, promise);
    return promise;
}

// ========== 번역 API (캐싱 + 중복 방지) ==========
export async function translateWithCache(text, sourceLang, targetLang, options = {}) {
    const cacheKey = `${text}:${sourceLang}:${targetLang}:${JSON.stringify(options)}`;

    // 캐시 확인
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('[API] 캐시 히트:', cacheKey.substring(0, 50));
        return cached;
    }

    // 중복 요청 방지
    return dedupeRequest(cacheKey, async () => {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.authToken && { 'Authorization': `Bearer ${options.authToken}` })
            },
            body: JSON.stringify({
                text,
                sourceLang,
                targetLang,
                ...options
            })
        });

        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();

        // 캐시 저장
        apiCache.set(cacheKey, data);

        return data;
    });
}

// ========== TTS API (중복 방지) ==========
export async function getTTSWithCache(text, language, options = {}) {
    const cacheKey = `tts:${text}:${language}:${JSON.stringify(options)}`;

    // 중복 요청 방지
    return dedupeRequest(cacheKey, async () => {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.authToken && { 'Authorization': `Bearer ${options.authToken}` })
            },
            body: JSON.stringify({
                action: 'tts',
                text,
                language,
                ...options
            })
        });

        if (!response.ok) {
            throw new Error(`TTS API 오류: ${response.status}`);
        }

        return response.json();
    });
}

// ========== 인증 API ==========
export async function authRequest(action, data) {
    const response = await fetch(AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API 오류');
    }

    return response.json();
}

// ========== 요청 재시도 로직 ==========
export async function retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            console.warn(`[API] 요청 실패 (${i + 1}/${maxRetries}), ${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// ========== Prefetch 최적화 ==========
export function prefetchTranslation(text, sourceLang, targetLang, options = {}) {
    // 백그라운드에서 미리 요청 (결과는 캐시에 저장됨)
    requestQueue.add(() => translateWithCache(text, sourceLang, targetLang, options))
        .catch(err => console.warn('[API] Prefetch 실패:', err));
}

// ========== 🚀 스트리밍 번역 API ==========
export async function translateWithStreaming(text, targetLang, options = {}, onChunk = null) {
    console.log('[Streaming] 스트리밍 번역 시작');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.authToken && { 'Authorization': `Bearer ${options.authToken}` })
            },
            body: JSON.stringify({
                action: 'translate-stream',
                inputText: text,
                targetLang: targetLang,
                getPronunciation: options.getPronunciation !== false,
                useAIContext: options.useAIContext || false,
                qualityLevel: options.qualityLevel || 3,
                model: options.model || 'auto',
                domain: options.domain || 'general'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.fallbackToNormal) {
                console.log('[Streaming] 폴백 요청됨, 일반 모드로 전환');
                return { fallback: true, error: errorData.error };
            }
            throw new Error(`스트리밍 API 오류: ${response.status}`);
        }

        const data = await response.json();

        // 청크 콜백 호출 (UI 업데이트용)
        if (onChunk && data.chunks && data.chunks.length > 0) {
            let displayedText = '';
            for (const chunk of data.chunks) {
                displayedText += chunk;
                onChunk(displayedText);
                // 시각적 효과를 위한 작은 딜레이
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }

        console.log('[Streaming] 스트리밍 완료:', data.streamingUsed ? '스트리밍 사용' : '일반 응답');
        return data;

    } catch (error) {
        console.error('[Streaming] 스트리밍 오류:', error.message);
        return { fallback: true, error: error.message };
    }
}

// ========== 스트리밍 + 폴백 통합 함수 ==========
export async function translateWithStreamingFallback(text, targetLang, options = {}, onChunk = null) {
    // 먼저 스트리밍 시도
    const streamResult = await translateWithStreaming(text, targetLang, options, onChunk);

    // 폴백 필요 시 일반 번역 사용
    if (streamResult.fallback) {
        console.log('[Streaming] 일반 번역으로 폴백 중...');
        return translateWithCache(text, 'auto', targetLang, {
            ...options,
            useAIContext: options.useAIContext,
            qualityLevel: options.qualityLevel
        });
    }

    return streamResult;
}
