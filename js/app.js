// ========== GPT 번역기 Pro v6.0 - 메인 앱 ==========
import { AsyncStorage, debounce, throttle, translationCache } from './storage.js';
import { translateWithCache, getTTSWithCache, prefetchTranslation, retryRequest } from './api.js';
import { initAuthSystem, login, register, logout, isAuthenticated, getCurrentUser, getAuthToken } from './auth.js';
import { VirtualScroller, LazyLoader, eventManager, perfMonitor, animateElement } from './ui-optimizer.js';

// ========== 전역 상태 ==========
window.appState = {
    currentUser: null,
    authToken: null,
    isAIMode: false,
    isPronunciationEnabled: true,
    vocabulary: [],
    translationHistory: []
};

// ========== Service Worker 등록 ==========
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/js/service-worker.js');
            console.log('[App] Service Worker 등록 성공:', registration);

            // 업데이트 확인
            registration.addEventListener('updatefound', () => {
                console.log('[App] Service Worker 업데이트 발견');
            });
        } catch (error) {
            console.error('[App] Service Worker 등록 실패:', error);
        }
    }
}

// ========== 앱 초기화 ==========
async function initApp() {
    console.log('[App] 초기화 시작...');
    perfMonitor.start('AppInit');

    try {
        // 1. Service Worker 등록
        await registerServiceWorker();

        // 2. 인증 시스템 초기화
        await initAuthSystem();

        // 3. 사용자 설정 로드
        await loadUserSettings();

        // 4. UI 초기화
        initUI();

        // 5. 이벤트 리스너 등록
        registerEventListeners();

        // 6. Virtual Scrolling 초기화 (단어장)
        initVirtualScrolling();

        // 7. 인증 상태 리스너
        window.addEventListener('authStateChanged', handleAuthStateChange);

        perfMonitor.end('AppInit');
        console.log('[App] 초기화 완료');
    } catch (error) {
        console.error('[App] 초기화 실패:', error);
    }
}

// ========== 사용자 설정 로드 ==========
async function loadUserSettings() {
    const settings = await AsyncStorage.getItem('userSettings');
    if (settings) {
        const parsed = JSON.parse(settings);
        window.appState.isAIMode = parsed.isAIMode || false;
        window.appState.isPronunciationEnabled = parsed.isPronunciationEnabled !== false;
    }
}

// ========== 사용자 설정 저장 (디바운스) ==========
const saveUserSettings = debounce(async () => {
    await AsyncStorage.setItem('userSettings', JSON.stringify({
        isAIMode: window.appState.isAIMode,
        isPronunciationEnabled: window.appState.isPronunciationEnabled
    }));
}, 500);

// ========== UI 초기화 ==========
function initUI() {
    // DOM 요소 캐싱은 기존 코드 유지
    // 테마 로드
    loadTheme();

    // 인증 UI 업데이트
    updateAuthUI();
}

// ========== Virtual Scrolling 초기화 ==========
let vocabularyScroller = null;

function initVirtualScrolling() {
    const vocabContainer = document.querySelector('.vocabulary-list');
    if (!vocabContainer) return;

    vocabularyScroller = new VirtualScroller(
        vocabContainer,
        80, // 아이템 높이
        (item, index) => {
            const div = document.createElement('div');
            div.className = 'vocab-item';
            div.innerHTML = `
                <div class="vocab-word">${item.word}</div>
                <div class="vocab-translation">${item.translation}</div>
                <button onclick="removeVocabItem(${index})">삭제</button>
            `;
            return div;
        }
    );

    // 단어장 데이터 로드
    loadVocabulary();
}

// ========== 단어장 로드 ==========
async function loadVocabulary() {
    const vocab = await AsyncStorage.getItem('vocabulary');
    if (vocab) {
        window.appState.vocabulary = JSON.parse(vocab);
        if (vocabularyScroller) {
            vocabularyScroller.setItems(window.appState.vocabulary);
        }
    }
}

// ========== 이벤트 리스너 등록 (메모리 누수 방지) ==========
function registerEventListeners() {
    // 번역 버튼
    const translateBtn = document.getElementById('translateBtn');
    if (translateBtn) {
        eventManager.addEventListener(
            translateBtn,
            'click',
            throttle(handleTranslate, 1000) // 1초에 1번만
        );
    }

    // 입력 필드 (자동 번역)
    const inputText = document.getElementById('inputText');
    if (inputText) {
        eventManager.addEventListener(
            inputText,
            'input',
            debounce(handleAutoTranslate, 800)
        );
    }

    // TTS 버튼
    const ttsButtons = document.querySelectorAll('.tts-btn');
    ttsButtons.forEach(btn => {
        eventManager.addEventListener(btn, 'click', handleTTS);
    });
}

// ========== 번역 처리 ==========
async function handleTranslate() {
    perfMonitor.start('Translation');

    const inputText = document.getElementById('inputText').value.trim();
    if (!inputText) return;

    const sourceLang = document.getElementById('sourceLangSelect').value;
    const targetLang = document.getElementById('targetLangSelect').value;

    try {
        showLoading(true);

        // 캐시 확인 + API 요청
        const result = await translateWithCache(inputText, sourceLang, targetLang, {
            authToken: getAuthToken(),
            aiMode: window.appState.isAIMode,
            pronunciation: window.appState.isPronunciationEnabled
        });

        displayTranslation(result);

        // 다음 번역 미리 가져오기 (Prefetch)
        const nextLang = getNextLanguage(targetLang);
        if (nextLang) {
            prefetchTranslation(inputText, sourceLang, nextLang, {
                authToken: getAuthToken()
            });
        }

    } catch (error) {
        console.error('[App] 번역 실패:', error);
        showError('번역 중 오류가 발생했습니다.');
    } finally {
        showLoading(false);
        perfMonitor.end('Translation');
    }
}

// ========== 자동 번역 (디바운스) ==========
const handleAutoTranslate = debounce(async () => {
    const autoTranslateEnabled = document.getElementById('autoTranslate')?.checked;
    if (autoTranslateEnabled) {
        await handleTranslate();
    }
}, 800);

// ========== TTS 처리 ==========
async function handleTTS(event) {
    const text = event.target.dataset.text;
    const lang = event.target.dataset.lang;

    if (!text || !lang) return;

    try {
        const result = await getTTSWithCache(text, lang, {
            authToken: getAuthToken(),
            engine: getCurrentTTSEngine()
        });

        playAudio(result.audioUrl);
    } catch (error) {
        console.error('[App] TTS 실패:', error);
        showError('음성 생성 중 오류가 발생했습니다.');
    }
}

// ========== 인증 상태 변경 핸들러 ==========
function handleAuthStateChange(event) {
    const { user, isAuthenticated } = event.detail;
    window.appState.currentUser = user;
    window.appState.authToken = isAuthenticated ? getAuthToken() : null;

    updateAuthUI();
}

// ========== 인증 UI 업데이트 ==========
function updateAuthUI() {
    const loginBtn = document.getElementById('loginToggle');
    if (!loginBtn) return;

    if (isAuthenticated()) {
        const user = getCurrentUser();
        loginBtn.textContent = user.displayName || user.email.split('@')[0];
        loginBtn.title = '로그아웃';
    } else {
        loginBtn.textContent = '👤';
        loginBtn.title = '로그인/회원가입';
    }
}

// ========== 유틸리티 함수 ==========
function showLoading(show) {
    const loader = document.querySelector('.loading-spinner');
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}

function showError(message) {
    // 기존 showStatus 함수 활용
    if (typeof window.showStatus === 'function') {
        window.showStatus(message, 'error');
    } else {
        alert(message);
    }
}

function displayTranslation(result) {
    const translationEl = document.getElementById('translation');
    const pronunciationEl = document.getElementById('pronunciation-content');

    if (translationEl) {
        // 애니메이션과 함께 표시
        translationEl.style.opacity = '0';
        translationEl.textContent = result.translation;
        animateElement(translationEl, { opacity: '1' }, 200);
    }

    if (pronunciationEl && result.pronunciation) {
        pronunciationEl.textContent = result.pronunciation;
    }
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

function getCurrentTTSEngine() {
    return document.getElementById('ttsEngineMode')?.value || 'auto';
}

function getNextLanguage(currentLang) {
    const languages = ['Korean', 'Vietnamese', 'English'];
    const currentIndex = languages.indexOf(currentLang);
    return languages[(currentIndex + 1) % languages.length];
}

function playAudio(url) {
    const audio = new Audio(url);
    audio.play().catch(err => console.error('[App] 오디오 재생 실패:', err));
}

// ========== 글로벌 함수 export (기존 코드 호환성) ==========
// 브리지에서 사용할 함수들을 window에 등록
export function registerGlobalFunctions() {
    // 번역 관련
    window.appModules = window.appModules || {};
    window.appModules.translate = handleTranslate;
    window.appModules.voiceTranslate = handleTranslate; // TODO: 별도 구현
    window.appModules.speak = handleTTS;

    // 단어장
    window.appModules.vocabulary = {
        load: loadVocabulary,
        add: async () => {
            // 단어장 추가 로직
            console.log('[Vocabulary] 단어 추가');
        }
    };
}

// ========== 앱 시작 ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
        registerGlobalFunctions();
    });
} else {
    initApp();
    registerGlobalFunctions();
}

// ========== 페이지 언로드 시 정리 ==========
window.addEventListener('beforeunload', () => {
    eventManager.destroy();
    if (vocabularyScroller) {
        vocabularyScroller.destroy();
    }
});

export { initApp, handleTranslate, handleTTS, loadVocabulary, registerGlobalFunctions };
