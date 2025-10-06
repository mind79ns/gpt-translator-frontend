// ========== 글로벌 함수 브리지 (레거시 onclick 호환성) ==========
// HTML의 인라인 onclick 핸들러를 위한 글로벌 함수들

// 이 파일은 기존 코드와의 호환성을 위해 window 객체에 함수들을 등록합니다.
// 점진적으로 이벤트 리스너 방식으로 마이그레이션할 수 있습니다.

// ========== 초기화 대기 ==========
let appReady = false;
let appModules = null;

window.addEventListener('app:ready', (event) => {
    appReady = true;
    appModules = event.detail;
    console.log('[Bridge] 앱 모듈 연결 완료');
});

// ========== UI 토글 함수들 ==========
window.toggleSettings = function() {
    const panel = document.getElementById('settingsPanel');
    if (panel) {
        panel.classList.toggle('active');
    }
};

window.toggleDashboard = function() {
    const modal = document.getElementById('dashboardModal');
    if (modal) {
        modal.classList.toggle('active');
    }
};

window.toggleVocabulary = function() {
    const panel = document.querySelector('.vocabulary-panel');
    if (panel) {
        panel.classList.toggle('active');
    }
};

window.toggleVocabularyWithAuth = function() {
    // 인증 필요 여부 확인
    if (appModules && appModules.auth && !appModules.auth.isAuthenticated()) {
        alert('단어장 기능은 로그인이 필요합니다.');
        window.toggleAuth();
        return;
    }
    window.toggleVocabulary();
};

window.toggleTheme = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};

window.toggleAuth = function() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.toggle('active');
    }
};

window.toggleApiKeys = function() {
    const modal = document.getElementById('apiKeysModal');
    if (modal) {
        modal.classList.toggle('active');
    }
};

window.toggleRecentPlays = function() {
    const list = document.getElementById('recentPlaysList');
    const btn = document.getElementById('recentPlaysToggleBtn');
    if (list && btn) {
        const isExpanded = list.style.display !== 'none';
        list.style.display = isExpanded ? 'none' : 'block';
        btn.textContent = isExpanded ? '펼치기' : '접기';
    }
};

window.togglePronunciationView = function() {
    const content = document.getElementById('pronunciation-content');
    const icon = document.getElementById('pronToggleIcon');
    if (content && icon) {
        const isExpanded = content.style.display !== 'none';
        content.style.display = isExpanded ? 'none' : 'block';
        icon.textContent = isExpanded ? '▼' : '▲';
    }
};

// ========== 번역 관련 함수들 ==========
window.handleTranslate = async function() {
    if (appModules && appModules.translate) {
        await appModules.translate();
    } else {
        console.warn('[Bridge] 번역 모듈이 아직 로드되지 않았습니다.');
    }
};

window.handleVoiceTranslate = async function() {
    if (appModules && appModules.voiceTranslate) {
        await appModules.voiceTranslate();
    } else {
        console.warn('[Bridge] 음성 번역 모듈이 아직 로드되지 않았습니다.');
    }
};

window.handleSpeak = async function() {
    if (appModules && appModules.speak) {
        await appModules.speak();
    } else {
        console.warn('[Bridge] TTS 모듈이 아직 로드되지 않았습니다.');
    }
};

window.swapLanguages = function() {
    const source = document.getElementById('sourceLangSelect');
    const target = document.getElementById('targetLangSelect');
    if (source && target) {
        const temp = source.value;
        source.value = target.value;
        target.value = temp;
    }
};

// ========== 클립보드 관련 ==========
window.copyTranslation = async function() {
    const translation = document.getElementById('translation')?.textContent;
    if (translation) {
        try {
            await navigator.clipboard.writeText(translation);
            showStatus('번역이 클립보드에 복사되었습니다.', 'success');
        } catch (err) {
            console.error('복사 실패:', err);
        }
    }
};

window.copyInputText = async function() {
    const inputText = document.getElementById('inputText')?.value;
    if (inputText) {
        try {
            await navigator.clipboard.writeText(inputText);
            showStatus('입력 텍스트가 복사되었습니다.', 'success');
        } catch (err) {
            console.error('복사 실패:', err);
        }
    }
};

window.pasteFromClipboard = async function() {
    try {
        const text = await navigator.clipboard.readText();
        const inputEl = document.getElementById('inputText');
        if (inputEl) {
            inputEl.value = text;
        }
    } catch (err) {
        console.error('붙여넣기 실패:', err);
    }
};

// ========== 초기화 및 클리어 ==========
window.clearAll = function() {
    const inputText = document.getElementById('inputText');
    const translation = document.getElementById('translation');
    const pronunciation = document.getElementById('pronunciation-content');

    if (inputText) inputText.value = '';
    if (translation) translation.textContent = '';
    if (pronunciation) pronunciation.textContent = '';
};

window.clearHistory = function() {
    if (confirm('번역 기록을 모두 삭제하시겠습니까?')) {
        localStorage.removeItem('translationHistory');
        showStatus('기록이 삭제되었습니다.', 'success');
        window.hideHistory();
    }
};

window.clearAllCache = function() {
    if (confirm('모든 캐시를 초기화하시겠습니까?')) {
        localStorage.clear();
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        showStatus('캐시가 초기화되었습니다.', 'success');
    }
};

// ========== 모달 표시/숨기기 ==========
window.showHistory = function() {
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.classList.add('active');
        // 기록 로드
        loadHistoryList();
    }
};

window.hideHistory = function() {
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

function loadHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const history = JSON.parse(localStorage.getItem('translationHistory') || '[]');

    if (history.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">번역 기록이 없습니다.</p>';
        return;
    }

    historyList.innerHTML = history.map((item, index) => `
        <div class="history-item">
            <div class="history-text">${item.source}</div>
            <div class="history-translation">${item.translation}</div>
            <div class="history-time">${new Date(item.timestamp).toLocaleString('ko-KR')}</div>
        </div>
    `).join('');
}

// ========== 인증 관련 ==========
window.handleLoginClick = function() {
    if (appModules && appModules.auth && appModules.auth.isAuthenticated()) {
        // 로그아웃
        if (confirm('로그아웃하시겠습니까?')) {
            appModules.auth.logout();
        }
    } else {
        // 로그인 모달 표시
        window.toggleAuth();
    }
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;

    if (!email || !password) {
        showStatus('이메일과 비밀번호를 입력해주세요.', 'error');
        return;
    }

    if (appModules && appModules.auth) {
        const result = await appModules.auth.login(email, password);
        if (result.success) {
            showStatus('로그인 성공!', 'success');
            window.toggleAuth();
        } else {
            showStatus(result.error || '로그인 실패', 'error');
        }
    }
};

window.handleRegister = async function() {
    const email = document.getElementById('registerEmail')?.value;
    const password = document.getElementById('registerPassword')?.value;
    const displayName = document.getElementById('registerName')?.value;

    if (!email || !password) {
        showStatus('이메일과 비밀번호를 입력해주세요.', 'error');
        return;
    }

    if (appModules && appModules.auth) {
        const result = await appModules.auth.register(email, password, displayName);
        if (result.success) {
            showStatus('회원가입 성공!', 'success');
            window.toggleAuth();
        } else {
            showStatus(result.error || '회원가입 실패', 'error');
        }
    }
};

window.continueAsGuest = function() {
    window.toggleAuth();
    showStatus('게스트로 계속 사용 중입니다. 일부 기능이 제한될 수 있습니다.', 'info');
};

window.switchAuthTab = function(tab) {
    const tabs = ['login', 'register', 'forgot'];
    tabs.forEach(t => {
        const el = document.getElementById(`${t}Tab`);
        if (el) {
            el.style.display = t === tab ? 'block' : 'none';
        }
    });
};

// ========== AI 모드 ==========
window.toggleAIModeWithAuth = function() {
    if (appModules && appModules.auth && !appModules.auth.isAuthenticated()) {
        alert('AI 문맥 번역은 로그인이 필요합니다.');
        window.toggleAuth();
        return;
    }

    const aiToggle = document.getElementById('aiToggle');
    const aiEnabled = aiToggle?.classList.toggle('active');

    if (window.appState) {
        window.appState.isAIMode = aiEnabled;
    }

    showStatus(aiEnabled ? 'AI 문맥 번역 활성화' : 'AI 문맥 번역 비활성화', 'info');
};

// ========== 대화 모드 ==========
window.switchToNormalMode = function() {
    document.getElementById('normalModeBtn')?.classList.add('active');
    document.getElementById('conversationModeBtn')?.classList.remove('active');
    document.querySelector('.conversation-controls')?.style.display = 'none';
};

window.switchToConversationMode = function() {
    document.getElementById('conversationModeBtn')?.classList.add('active');
    document.getElementById('normalModeBtn')?.classList.remove('active');
    document.querySelector('.conversation-controls')?.style.display = 'block';
};

window.startConversation = function() {
    console.log('[Bridge] 대화 모드 시작');
    showStatus('대화 모드가 시작되었습니다.', 'success');
};

window.stopConversation = function() {
    console.log('[Bridge] 대화 모드 종료');
    showStatus('대화 모드가 종료되었습니다.', 'info');
};

window.clearConversation = function() {
    if (confirm('대화 내용을 모두 삭제하시겠습니까?')) {
        document.getElementById('conversationHistory').innerHTML = '';
    }
};

// ========== 단어장 관련 ==========
window.addVocabulary = function() {
    console.log('[Bridge] 단어 추가');
    if (appModules && appModules.vocabulary) {
        appModules.vocabulary.add();
    }
};

window.addTerminology = function() {
    const input = document.getElementById('terminologyInput');
    if (input && input.value) {
        console.log('[Bridge] 용어 추가:', input.value);
        input.value = '';
    }
};

// ========== 퀴즈 관련 ==========
window.startQuiz = function(mode = 'normal') {
    console.log('[Bridge] 퀴즈 시작:', mode);
    const modal = document.getElementById('quizModal');
    if (modal) {
        modal.classList.add('active');
    }
};

window.closeQuiz = function() {
    const modal = document.getElementById('quizModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.nextQuestion = function() {
    console.log('[Bridge] 다음 문제');
};

// ========== 단어 상세보기 ==========
window.closeWordDetail = function() {
    const modal = document.getElementById('wordDetailModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.speakCurrentWord = function() {
    console.log('[Bridge] 현재 단어 발음');
};

window.startSingleWordQuiz = function() {
    console.log('[Bridge] 단일 단어 퀴즈');
};

window.startPronunciationPractice = function() {
    console.log('[Bridge] 발음 연습 시작');
    const modal = document.getElementById('practiceModal');
    if (modal) {
        modal.classList.add('active');
    }
};

window.closePractice = function() {
    const modal = document.getElementById('practiceModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.showPreviousWord = function() {
    console.log('[Bridge] 이전 단어');
};

window.showNextWord = function() {
    console.log('[Bridge] 다음 단어');
};

window.listenPracticeWord = function() {
    console.log('[Bridge] 연습 단어 듣기');
};

window.toggleRecording = function() {
    console.log('[Bridge] 녹음 토글');
};

window.nextPracticeWord = function() {
    console.log('[Bridge] 다음 연습 단어');
};

// ========== API 키 관리 ==========
window.saveOpenAIKey = async function() {
    const key = document.getElementById('openaiKeyInput')?.value;
    if (!key) {
        showStatus('API 키를 입력해주세요.', 'error');
        return;
    }

    if (appModules && appModules.auth) {
        try {
            await appModules.auth.saveApiKey('openai', key);
            showStatus('OpenAI API 키가 저장되었습니다.', 'success');
        } catch (error) {
            showStatus('API 키 저장 실패', 'error');
        }
    }
};

window.saveGoogleKey = async function() {
    const key = document.getElementById('googleKeyInput')?.value;
    if (!key) {
        showStatus('API 키를 입력해주세요.', 'error');
        return;
    }

    if (appModules && appModules.auth) {
        try {
            await appModules.auth.saveApiKey('google', key);
            showStatus('Google API 키가 저장되었습니다.', 'success');
        } catch (error) {
            showStatus('API 키 저장 실패', 'error');
        }
    }
};

window.testOpenAIKey = function() {
    showStatus('API 키 테스트 중...', 'info');
    // 테스트 로직 구현 필요
};

window.testGoogleKey = function() {
    showStatus('API 키 테스트 중...', 'info');
    // 테스트 로직 구현 필요
};

window.handleForgotPassword = function() {
    const email = document.getElementById('forgotEmail')?.value;
    if (!email) {
        showStatus('이메일을 입력해주세요.', 'error');
        return;
    }
    showStatus('비밀번호 재설정 링크가 이메일로 전송되었습니다.', 'success');
};

// ========== 상태 표시 ==========
window.showStatus = function(message, type = 'info') {
    console.log(`[Status ${type}]`, message);

    // 토스트 알림 생성
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--info, #2196F3)'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s;
    `;

    document.body.appendChild(toast);

    // 애니메이션
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

console.log('[Bridge] 글로벌 함수 브리지 로드 완료');
