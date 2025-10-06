// ========== 인증 시스템 모듈 ==========
import { AsyncStorage } from './storage.js';
import { authRequest } from './api.js';

// 인증 상태
let currentUser = null;
let authToken = null;

// ========== 인증 상태 관리 ==========
export async function initAuthSystem() {
    console.log('[Auth] 시스템 초기화 시작');

    try {
        // 저장된 토큰 확인
        const storedToken = await AsyncStorage.getItem('authToken');
        const storedUser = await AsyncStorage.getItem('currentUser');

        if (storedToken && storedUser) {
            authToken = storedToken;
            currentUser = JSON.parse(storedUser);

            // 토큰 유효성 검증
            const isValid = await verifyToken(storedToken);
            if (isValid) {
                console.log('[Auth] 자동 로그인 성공:', currentUser.email);
                updateAuthUI();
                return true;
            } else {
                console.log('[Auth] 토큰 만료, 로그아웃 처리');
                await logout();
            }
        }
    } catch (error) {
        console.error('[Auth] 초기화 실패:', error);
    }

    return false;
}

// ========== 토큰 검증 ==========
async function verifyToken(token) {
    try {
        const response = await authRequest('verify', { token });
        return response.success;
    } catch (error) {
        console.error('[Auth] 토큰 검증 실패:', error);
        return false;
    }
}

// ========== 로그인 ==========
export async function login(email, password) {
    try {
        const response = await authRequest('login', { email, password });

        if (response.success) {
            authToken = response.token;
            currentUser = response.user;

            // 토큰 저장 (비동기)
            await AsyncStorage.setItem('authToken', authToken);
            await AsyncStorage.setItem('currentUser', JSON.stringify(currentUser));

            console.log('[Auth] 로그인 성공:', currentUser.email);
            updateAuthUI();
            return { success: true, user: currentUser };
        } else {
            return { success: false, error: response.error };
        }
    } catch (error) {
        console.error('[Auth] 로그인 실패:', error);
        return { success: false, error: error.message };
    }
}

// ========== 회원가입 ==========
export async function register(email, password, displayName) {
    try {
        const response = await authRequest('register', { email, password, displayName });

        if (response.success) {
            console.log('[Auth] 회원가입 성공:', email);
            // 자동 로그인
            return await login(email, password);
        } else {
            return { success: false, error: response.error };
        }
    } catch (error) {
        console.error('[Auth] 회원가입 실패:', error);
        return { success: false, error: error.message };
    }
}

// ========== 로그아웃 ==========
export async function logout() {
    authToken = null;
    currentUser = null;

    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('currentUser');

    console.log('[Auth] 로그아웃 완료');
    updateAuthUI();
}

// ========== 인증 상태 확인 ==========
export function isAuthenticated() {
    return authToken !== null && currentUser !== null;
}

export function getCurrentUser() {
    return currentUser;
}

export function getAuthToken() {
    return authToken;
}

// ========== UI 업데이트 (이벤트 기반) ==========
function updateAuthUI() {
    // 커스텀 이벤트 발생 (UI 모듈에서 리스닝)
    window.dispatchEvent(new CustomEvent('authStateChanged', {
        detail: { user: currentUser, isAuthenticated: isAuthenticated() }
    }));
}

// ========== API 키 관리 ==========
export async function saveApiKey(provider, apiKey, keyName = 'My API Key') {
    if (!isAuthenticated()) {
        throw new Error('로그인이 필요합니다.');
    }

    try {
        const response = await authRequest('saveApiKey', {
            token: authToken,
            provider,
            apiKey,
            keyName
        });

        return response;
    } catch (error) {
        console.error('[Auth] API 키 저장 실패:', error);
        throw error;
    }
}

export async function getApiKey(provider) {
    if (!isAuthenticated()) {
        return null;
    }

    try {
        const response = await authRequest('getApiKey', {
            token: authToken,
            provider
        });

        return response.success ? response.apiKey : null;
    } catch (error) {
        console.error('[Auth] API 키 조회 실패:', error);
        return null;
    }
}
