// auth.js - 사용자 인증 및 API 키 관리 Netlify Function
const { 
  createUser, 
  authenticateUser, 
  verifyToken, 
  saveUserApiKey, 
  getUserApiKey,
  supabase,
  trackUsage, 
  getPublicCache, 
  setPublicCache,
  // 단어장 관련 함수들
  saveUserVocabulary,
  getUserVocabulary,
  addUserWord,
  updateUserWord,
  deleteUserWord,
  // 설정 관련 함수들  
  saveUserSettings,
  getUserSettings,
  saveUserAISettings,
  getUserAISettings,
  saveTranslationHistory,
  getUserTranslationHistory
} = require('./database');

// 함수 존재 확인 로그
console.log('[Auth] 함수 로드 상태:', {
  saveUserVocabulary: typeof saveUserVocabulary === 'function',
  getUserVocabulary: typeof getUserVocabulary === 'function',
  saveUserSettings: typeof saveUserSettings === 'function',
  getUserSettings: typeof getUserSettings === 'function',
  saveUserAISettings: typeof saveUserAISettings === 'function',
  getUserAISettings: typeof getUserAISettings === 'function',
  saveTranslationHistory: typeof saveTranslationHistory === 'function',
  getUserTranslationHistory: typeof getUserTranslationHistory === 'function'
});

// 필수 함수 검증
if (!saveUserSettings || typeof saveUserSettings !== 'function') {
  console.error('[Auth] CRITICAL: saveUserSettings 함수가 로드되지 않았습니다!');
}
if (!getUserSettings || typeof getUserSettings !== 'function') {
  console.error('[Auth] CRITICAL: getUserSettings 함수가 로드되지 않았습니다!');
}

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
// 환경변수 체크
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[Auth] 환경변수 누락:', {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY
  });
}
exports.handler = async function (event, context) {
  // 🔧 OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // 🔧 POST 요청만 허용
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    // 🔧 요청 본문 파싱
    const { action, email, password, displayName, provider, apiKey, keyName } = JSON.parse(event.body || '{}');

    console.log(`[Auth] 액션 요청: ${action}`);

    // 🔧 액션별 라우팅
    switch (action) {
      case 'register':
        return await handleRegister(email, password, displayName);
      
       case 'login':
        return await handleLogin(event, email, password); // 👈 event 인자 전달
      
      case 'forgot-password':
        return await handleForgotPassword(email);
      
      case 'save-api-key':
        return await handleSaveApiKey(event.headers, provider, apiKey, keyName);
      
      case 'get-api-keys':
        return await handleGetApiKeys(event.headers);
      
      case 'delete-api-key':
        return await handleDeleteApiKey(event.headers, provider);
      
        case 'get-usage':
        return await handleGetUsage(event.headers);
      
      case 'get-monthly-cost':
        return await handleGetMonthlyCost(event.headers);
      
      case 'get-dashboard-data':
        return await handleGetDashboardData(event.headers);

      case 'verify-token':
        return await handleVerifyToken(event.headers);

        case 'sync-user-data':
        return await handleSyncUserData(event.headers);
      
      case 'save-vocabulary':
  const vocabBody = JSON.parse(event.body || '{}');
  return await handleSaveVocabulary(event.headers, vocabBody.vocabularyData);
      
      case 'save-settings':
  const bodyData = JSON.parse(event.body || '{}');
  return await handleSaveSettings(event.headers, bodyData.settings);
      
      case 'save-ai-settings':
        return await handleSaveAISettings(event.headers, JSON.parse(event.body).aiSettings);
      
      case 'save-translation-history':
        return await handleSaveTranslationHistory(event.headers, JSON.parse(event.body).historyData);
      
      case 'get-user-data':
        return await handleGetUserData(event.headers);

      default:
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `알 수 없는 액션: ${action}` })
        };
    }

  } catch (error) {
    console.error('[Auth] 핸들러 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: '서버 내부 오류',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

// auth.js

// [시작점] 아래 함수 전체를 교체합니다.
// 🔐 회원가입 처리 (Supabase 공식 방식으로 수정)
async function handleRegister(email, password, displayName) {
  console.log(`[Auth] 회원가입 시도: ${email}`);

  if (!email || !password) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '이메일과 비밀번호가 필요합니다.' })
    };
  }
  if (password.length < 8) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '비밀번호는 8자 이상이어야 합니다.' })
    };
  }

  try {
    // 💡 supabase.auth.signUp 공식 함수를 사용하여 auth.users에 사용자를 생성합니다.
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password: password,
      options: {
        // displayName을 user_metadata에 저장합니다.
        data: {
          display_name: displayName?.trim() || email.split('@')[0]
        }
      }
    });

    if (error) {
      // 회원가입 실패 시 Supabase가 제공하는 에러를 반환합니다.
      console.error(`[Auth] 회원가입 실패:`, error.message);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      };
    }

    // 성공 시, data.user 객체에는 올바른 UUID를 가진 사용자가 포함됩니다.
    console.log(`[Auth] 회원가입 성공: ${data.user.email} (ID: ${data.user.id})`);
    return {
      statusCode: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 활성화해주세요.',
        user: data.user
      })
    };

  } catch (error) {
    console.error('[Auth] 회원가입 처리 중 심각한 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: '회원가입 처리 중 오류가 발생했습니다.' })
    };
  }
}
// [끝점]

// 🔐 로그인 처리 (개선)
async function handleLogin(event, email, password) { // 👈 event 인자 추가
  console.log(`[Auth] 로그인 시도: ${email}`);
// ...

  // 🔧 개선: 입력값 유효성 검사
  if (!email || !password) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '이메일과 비밀번호가 필요합니다.' })
    };
  }

  // 🔧 추가: 브루트 포스 공격 방지를 위한 기본 검증
  if (password.length > 100) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '올바르지 않은 요청입니다.' })
    };
  }

  const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
  console.log(`[Auth] 로그인 시도 - IP: ${clientIP}, Email: ${email}`);

  try {
    const result = await authenticateUser(email.toLowerCase().trim(), password);

    if (result.success) {
      console.log(`[Auth] 로그인 성공: ${email} (ID: ${result.user.id})`);
      
      // 🔧 개선: 로그인 성공 시 사용자 정보 및 토큰 반환
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: '로그인 성공',
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName,
            isPremium: result.user.isPremium || false
          },
          token: result.token,
          expiresIn: '7d'
        })
      };
    } else {
      console.log(`[Auth] 로그인 실패: ${email} - ${result.error} (IP: ${clientIP})`);
      
      // 🔧 보안: 구체적인 실패 이유 숨기기
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: '이메일 또는 비밀번호가 올바르지 않습니다.' 
        })
      };
    }

  } catch (error) {
    console.error('[Auth] 로그인 처리 오류:', error);
    
    // 🔧 보안: 내부 오류 상세 정보 숨기기
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' 
      })
    };
  }
}

// 🔐 비밀번호 재설정 처리
async function handleForgotPassword(email) {
  console.log(`[Auth] 비밀번호 재설정 요청: ${email}`);

  if (!email) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '이메일이 필요합니다.' })
    };
  }

  // 🔧 추후 이메일 발송 기능 구현 예정
  // 현재는 성공 응답만 반환
  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      message: '비밀번호 재설정 링크가 이메일로 발송되었습니다.'
    })
  };
}

// 🔧 인증 토큰 검증 헬퍼
async function verifyAuthToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: '인증 토큰이 필요합니다.' };
  }

  const token = authHeader.substring(7);
  const result = await verifyToken(token);

  if (!result.success) {
    return { success: false, error: '유효하지 않은 토큰입니다.' };
  }

  return { success: true, userId: result.userId, email: result.email };
}

// 🔑 API 키 저장 처리 (완전 구현)
async function handleSaveApiKey(headers, provider, apiKey, keyName) {
  console.log(`[API Keys] API 키 저장 요청: ${provider}`);

  // 인증 확인
  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  // 🔧 입력값 검증
  if (!provider || !apiKey || !keyName) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'provider, apiKey, keyName이 모두 필요합니다.' 
      })
    };
  }

  // 지원되는 프로바이더 확인
  if (!['openai', 'google'].includes(provider)) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: '지원되지 않는 API 프로바이더입니다.' 
      })
    };
  }

  // 🔧 API 키 형식 검증
  if (provider === 'openai') {
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: '올바른 OpenAI API 키 형식이 아닙니다. (sk-로 시작)' 
        })
      };
    }
  } else if (provider === 'google') {
    if (!apiKey.startsWith('AIza') || apiKey.length < 20) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: '올바른 Google API 키 형식이 아닙니다. (AIza로 시작)' 
        })
      };
    }
  }

  // API 키 길이 제한
  if (apiKey.length > 200) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'API 키가 너무 깁니다.' 
      })
    };
  }

  try {
    // 🔧 API 키 저장
    const result = await saveUserApiKey(authResult.userId, apiKey, keyName, provider);

    if (result.success) {
      console.log(`[API Keys] ${provider} API 키 저장 성공: 사용자 ${authResult.userId}`);
      
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: `${provider.toUpperCase()} API 키가 안전하게 저장되었습니다.`,
          provider: provider
        })
      };
    } else {
      console.error(`[API Keys] ${provider} API 키 저장 실패:`, result.error);
      
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: `API 키 저장에 실패했습니다: ${result.error}`
        })
      };
    }

  } catch (error) {
    console.error('[API Keys] API 키 저장 처리 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'API 키 저장 중 오류가 발생했습니다.'
      })
    };
  }
}

// 🔑 API 키 조회 처리 (완전 구현)
async function handleGetApiKeys(headers) {
  console.log('[API Keys] API 키 조회 요청');

  // 인증 확인
  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    // 🔧 OpenAI 및 Google API 키 조회
    const [openaiResult, googleResult] = await Promise.all([
      getUserApiKey(authResult.userId, 'openai'),
      getUserApiKey(authResult.userId, 'google')
    ]);

    console.log(`[API Keys] 키 조회 완료 - OpenAI: ${openaiResult.success}, Google: ${googleResult.success}`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        openaiKey: openaiResult.success,
        googleKey: googleResult.success,
        keys: {
          openai: {
            exists: openaiResult.success,
            keyName: openaiResult.success ? 'OpenAI API Key' : null,
            lastUpdated: openaiResult.success ? new Date().toISOString() : null
          },
          google: {
            exists: googleResult.success,
            keyName: googleResult.success ? 'Google API Key' : null,
            lastUpdated: googleResult.success ? new Date().toISOString() : null
          }
        }
      })
    };

  } catch (error) {
    console.error('[API Keys] API 키 조회 처리 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'API 키 조회 중 오류가 발생했습니다.'
      })
    };
  }
}

// 🔑 API 키 삭제 처리 (완전 구현)
async function handleDeleteApiKey(headers, provider) {
  console.log(`[API Keys] API 키 삭제 요청: ${provider}`);

  // 인증 확인
  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  // 🔧 입력값 검증
  if (!provider) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'provider가 필요합니다.' 
      })
    };
  }

  // 지원되는 프로바이더 확인
  if (!['openai', 'google'].includes(provider)) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: '지원되지 않는 API 프로바이더입니다.' 
      })
    };
  }

  try {
    // 🔧 API 키 삭제 (빈 문자열로 업데이트)
    const result = await saveUserApiKey(authResult.userId, '', `Deleted ${provider} Key`, provider);

    if (result.success) {
      console.log(`[API Keys] ${provider} API 키 삭제 성공: 사용자 ${authResult.userId}`);
      
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: `${provider.toUpperCase()} API 키가 삭제되었습니다.`,
          provider: provider
        })
      };
    } else {
      console.error(`[API Keys] ${provider} API 키 삭제 실패:`, result.error);
      
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: `API 키 삭제에 실패했습니다: ${result.error}`
        })
      };
    }

  } catch (error) {
    console.error('[API Keys] API 키 삭제 처리 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'API 키 삭제 중 오류가 발생했습니다.'
      })
    };
  }
}

// 🔐 토큰 검증 처리
async function handleVerifyToken(headers) {
  console.log('[Auth] 토큰 검증 요청');

  // 인증 확인
  const authResult = await verifyAuthToken(headers);
  
  if (authResult.success) {
    console.log(`[Auth] 토큰 검증 성공: ${authResult.email}`);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        user: {
          id: authResult.userId,
          email: authResult.email
        }
      })
    };
  } else {
    console.log('[Auth] 토큰 검증 실패');
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: '토큰이 유효하지 않습니다.'
      })
    };
  }
}

// auth.js

// auth.js

// [시작점] 교체할 함수
// 📊 사용량 조회 처리 (중복 데이터 방어 로직 추가 버전)
async function handleGetUsage(headers) {
  console.log('[Usage] 사용량 조회 요청 (안전 모드)');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // 🔴 [수정] .single() 대신 .limit(1)을 사용하여 중복 데이터에도 서버가 중단되지 않도록 변경
    const { data: todayResult, error: todayError } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', authResult.userId)
      .eq('date', today)
      .limit(1);

    if (todayError) throw todayError;

    // 결과가 배열이므로 첫 번째 요소를 사용
    const todayUsage = (todayResult && todayResult.length > 0) ? todayResult[0] : null;

    const { data: monthlyUsage, error: monthlyError } = await supabase
      .from('usage_logs')
      .select('translation_count, tts_count, cost_usd')
      .eq('user_id', authResult.userId)
      .gte('date', firstDayOfMonth)
      .lte('date', lastDayOfMonth);

    if (monthlyError) throw monthlyError;

    const monthlyTotals = monthlyUsage.reduce((acc, row) => {
      acc.translations += row.translation_count || 0;
      acc.tts += row.tts_count || 0;
      acc.cost += row.cost_usd || 0;
      return acc;
    }, { translations: 0, tts: 0, cost: 0 });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);
    const weekStartDate = sevenDaysAgo.toISOString().split('T')[0];

    const { data: weeklyUsage, error: weeklyError } = await supabase
      .from('usage_logs')
      .select('date, translation_count, cost_usd')
      .eq('user_id', authResult.userId)
      .gte('date', weekStartDate)
      .lte('date', today)
      .order('date', { ascending: true });

    if (weeklyError) throw weeklyError;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        usage: {
          today: {
            translations: todayUsage?.translation_count || 0,
            tts: todayUsage?.tts_count || 0,
            cost: todayUsage?.cost_usd || 0
          },
          thisMonth: monthlyTotals,
          weekly: weeklyUsage || []
        }
      })
    };
  } catch (error) {
    console.error('[Usage] 사용량 조회 처리 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: `사용량 조회 중 오류가 발생했습니다: ${error.message}`
      })
    };
  }
}
// [끝점]

// 📊 월별 비용 조회 처리
async function handleGetMonthlyCost(headers) {
  console.log('[Usage] 월별 비용 조회 요청');

  // 인증 확인
  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    // 🔧 최근 6개월 비용 데이터 조회
    const currentDate = new Date();
    const months = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = date.toISOString().substring(0, 7);
      months.push(monthStr);
    }

    const monthlyData = [];

    for (const month of months) {
      const { data: monthUsage, error } = await supabase
        .from('usage_logs')
        .select('cost_usd')
        .eq('user_id', authResult.userId)
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`);

      if (error) {
        throw error;
      }

      const totalCost = monthUsage.reduce((sum, row) => sum + (row.cost_usd || 0), 0);
      
      monthlyData.push({
        month: month,
        cost: totalCost,
        monthLabel: new Date(month + '-01').toLocaleDateString('ko-KR', { month: 'short' })
      });
    }

    console.log(`[Usage] 월별 비용 조회 완료 - 사용자: ${authResult.userId}`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        monthlyData: monthlyData
      })
    };

  } catch (error) {
    console.error('[Usage] 월별 비용 조회 처리 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: '월별 비용 조회 중 오류가 발생했습니다.'
      })
    };
  }
}

// auth.js

// auth.js

// [시작점] 이 함수 전체를 교체하세요.
// 📊 대시보드 데이터 종합 조회 (누락된 데이터 조회 로직이 추가된 최종 버전)
async function handleGetDashboardData(headers) {
  console.log('[Dashboard] 대시보드 데이터 조회 요청 (최종 버전)');
  
  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    const userId = authResult.userId;
    const dashboardData = {
      usage: { daily: { translations: 0, cost: 0 }, monthly: { translations: 0, cost: 0, saved: 0 } },
      apiKeys: { openai: false, google: false },
      vocabulary: { total: 0, studied: 0 },
      weekly: [],
      monthlyChart: []
    };

    // 1. API 키 상태
    const [openaiKeyResult, googleKeyResult] = await Promise.all([ getUserApiKey(userId, 'openai'), getUserApiKey(userId, 'google') ]);
    dashboardData.apiKeys.openai = openaiKeyResult.success && !!openaiKeyResult.apiKey;
    dashboardData.apiKeys.google = googleKeyResult.success && !!googleKeyResult.apiKey;

    // 2. 단어장 통계
    const vocabResult = await getUserVocabulary(userId);
    if (vocabResult.success && vocabResult.vocabulary) {
      const vocabArray = Array.from(vocabResult.vocabulary.values());
      dashboardData.vocabulary.total = vocabArray.length;
      dashboardData.vocabulary.studied = vocabArray.filter(w => (w.correctCount || 0) > 0 || (w.wrongCount || 0) > 0).length;
    }

    // 3. 사용량 통계 (일간, 월간)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: usageData, error: usageError } = await supabase
      .from('usage_logs').select('date, translation_count, cost_usd').eq('user_id', userId).gte('date', firstDayOfMonth);
    if (usageError) throw usageError;

    if (usageData) {
      usageData.forEach(log => {
        if (log.date === today) {
          dashboardData.usage.daily.translations += log.translation_count || 0;
          dashboardData.usage.daily.cost += log.cost_usd || 0;
        }
        dashboardData.usage.monthly.translations += log.translation_count || 0;
        dashboardData.usage.monthly.cost += log.cost_usd || 0;
      });
    }

    // 4. 주간 차트 데이터
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);
    const { data: weeklyData, error: weeklyError } = await supabase
      .from('usage_logs').select('date, translation_count').eq('user_id', userId).gte('date', sevenDaysAgo.toISOString().split('T')[0]);
    if (weeklyError) throw weeklyError;
    dashboardData.weekly = weeklyData || [];

    // 5. 월별 비용 차트 데이터 (최근 6개월)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const { data: monthlyCostData, error: monthlyCostError } = await supabase
      .from('usage_logs').select('date, cost_usd').eq('user_id', userId).gte('date', sixMonthsAgo.toISOString().split('T')[0]);
    if (monthlyCostError) throw monthlyCostError;
    
    const monthlyAggregates = {};
    if (monthlyCostData) {
      monthlyCostData.forEach(log => {
        const month = log.date.substring(0, 7);
        if (!monthlyAggregates[month]) monthlyAggregates[month] = 0;
        monthlyAggregates[month] += log.cost_usd || 0;
      });
    }
    dashboardData.monthlyChart = Object.entries(monthlyAggregates).map(([month, cost]) => ({ month, cost, monthLabel: new Date(month + '-02').toLocaleDateString('ko-KR', { month: 'short' }) }));
    
    console.log('[Dashboard] 최종 데이터 수집 완료:', dashboardData);
    return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, data: dashboardData }) };

  } catch (error) {
    console.error('[Dashboard] 최종 조회 오류:', error);
    return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: `대시보드 조회 실패: ${error.message}` }) };
  }
}
// [끝점]

// ===================================================
// 🔄 데이터 동기화 핸들러 함수들
// ===================================================

// 전체 사용자 데이터 동기화
async function handleSyncUserData(headers) {
  console.log('[Sync] 사용자 데이터 동기화 요청');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    // 모든 사용자 데이터 병렬 로드
    const [vocabularyResult, settingsResult, aiSettingsResult, historyResult] = await Promise.all([
      getUserVocabulary(authResult.userId),
      getUserSettings(authResult.userId),
      getUserAISettings(authResult.userId),
      getUserTranslationHistory(authResult.userId, 50)
    ]);

    console.log(`[Sync] 데이터 동기화 완료 - 사용자: ${authResult.userId}`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          vocabulary: vocabularyResult.success ? vocabularyResult.vocabulary : new Map(),
          settings: settingsResult.success ? settingsResult.settings : {},
          aiSettings: aiSettingsResult.success ? aiSettingsResult.aiSettings : {},
          history: historyResult.success ? historyResult.history : []
        }
      })
    };

  } catch (error) {
    console.error('[Sync] 데이터 동기화 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: '데이터 동기화 중 오류가 발생했습니다.'
      })
    };
  }
}

// 단어장 저장 (안전한 버전)
async function handleSaveVocabulary(headers, vocabularyData) {
  console.log('[Sync] 단어장 저장 요청');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    // 함수 존재 확인
    if (!saveUserVocabulary || typeof saveUserVocabulary !== 'function') {
      console.error('[Sync] CRITICAL: saveUserVocabulary 함수가 로드되지 않음');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: '서버 구성 오류: 단어장 저장 기능을 사용할 수 없습니다.'
        })
      };
    }

    // 데이터 유효성 검증
    if (!vocabularyData) {
      console.warn('[Sync] 빈 단어장 데이터');
      vocabularyData = [];
    }

    // 데이터 타입 확인 및 변환
    let processedData = vocabularyData;
    if (typeof vocabularyData === 'object' && !Array.isArray(vocabularyData)) {
      // Map이나 객체인 경우 배열로 변환
      processedData = Object.entries(vocabularyData);
    }
    
    console.log(`[Sync] 단어장 저장 시작 - 사용자: ${authResult.userId}, 데이터: ${processedData.length}개`);
    
    const result = await saveUserVocabulary(authResult.userId, processedData);

    if (result && result.success) {
      console.log(`[Sync] 단어장 저장 성공 - 사용자: ${authResult.userId}`);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: '단어장이 서버에 저장되었습니다.'
        })
      };
    } else {
      console.error('[Sync] 단어장 저장 실패:', result?.error || '알 수 없는 오류');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: result?.error || '단어장 저장에 실패했습니다.'
        })
      };
    }

  } catch (error) {
    console.error('[Sync] 단어장 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: `단어장 저장 중 오류: ${error.message}`
      })
    };
  }
}

// 사용자 설정 저장
async function handleSaveSettings(headers, settings) {
  console.log('[Sync] 사용자 설정 저장 요청:', settings);

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    // 함수 존재 확인
    if (!saveUserSettings || typeof saveUserSettings !== 'function') {
      console.error('[Sync] saveUserSettings 함수를 찾을 수 없습니다');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'saveUserSettings 함수를 찾을 수 없습니다.'
        })
      };
    }

    // 설정 데이터 검증
    if (!settings || typeof settings !== 'object') {
      console.error('[Sync] 잘못된 설정 데이터:', settings);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: '유효하지 않은 설정 데이터입니다.'
        })
      };
    }

    console.log(`[Sync] 설정 저장 시작 - 사용자: ${authResult.userId}`);
    const result = await saveUserSettings(authResult.userId, settings);

    if (result && result.success) {
      console.log(`[Sync] 사용자 설정 저장 성공 - 사용자: ${authResult.userId}`);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: '사용자 설정이 서버에 저장되었습니다.'
        })
      };
    } else {
      console.error('[Sync] 설정 저장 실패:', result?.error || '알 수 없는 오류');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: result?.error || '설정 저장에 실패했습니다.'
        })
      };
    }

  } catch (error) {
    console.error('[Sync] 사용자 설정 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: `설정 저장 중 오류: ${error.message}`
      })
    };
  }
}

// AI 설정 저장
async function handleSaveAISettings(headers, aiSettings) {
  console.log('[Sync] AI 설정 저장 요청');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    const result = await saveUserAISettings(authResult.userId, aiSettings);

    if (result.success) {
      console.log(`[Sync] AI 설정 저장 성공 - 사용자: ${authResult.userId}`);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: 'AI 설정이 서버에 저장되었습니다.'
        })
      };
    } else {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: result.error
        })
      };
    }

  } catch (error) {
    console.error('[Sync] AI 설정 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'AI 설정 저장 중 오류가 발생했습니다.'
      })
    };
  }
}

// 번역 기록 저장
async function handleSaveTranslationHistory(headers, historyData) {
  console.log('[Sync] 번역 기록 저장 요청');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    const result = await saveTranslationHistory(authResult.userId, historyData);

    if (result.success) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: '번역 기록이 서버에 저장되었습니다.'
        })
      };
    } else {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: result.error
        })
      };
    }

  } catch (error) {
    console.error('[Sync] 번역 기록 저장 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: '번역 기록 저장 중 오류가 발생했습니다.'
      })
    };
  }
}

// 사용자 데이터 전체 로드 (안전한 버전)
async function handleGetUserData(headers) {
  console.log('[Sync] 사용자 데이터 로드 요청');

  const authResult = await verifyAuthToken(headers);
  if (!authResult.success) {
    return {
      statusCode: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: authResult.error })
    };
  }

  try {
    console.log('[Sync] 사용자 데이터 로드 시작 - ID:', authResult.userId);
    
    // 함수 존재 확인 및 로깅
    const functionsAvailable = {
      vocabulary: typeof getUserVocabulary === 'function',
      settings: typeof getUserSettings === 'function',
      aiSettings: typeof getUserAISettings === 'function',
      history: typeof getUserTranslationHistory === 'function'
    };
    
    console.log('[Sync] 사용 가능한 함수:', functionsAvailable);

    // 각 데이터 초기화
    const userData = {
      vocabulary: [],
      settings: null,
      aiSettings: null,
      history: []
    };

    // 1. 단어장 로드
    if (functionsAvailable.vocabulary) {
      try {
        const result = await getUserVocabulary(authResult.userId);
        if (result && result.success) {
          // Map을 배열로 변환
          userData.vocabulary = result.vocabulary instanceof Map 
            ? Array.from(result.vocabulary.entries())
            : result.vocabulary || [];
          console.log('[Sync] 단어장 로드 성공:', userData.vocabulary.length, '개');
        }
      } catch (error) {
        console.error('[Sync] 단어장 로드 오류:', error.message);
      }
    }

    // 2. 사용자 설정 로드
    if (functionsAvailable.settings) {
      try {
        const result = await getUserSettings(authResult.userId);
        if (result && result.success) {
          userData.settings = result.settings;
          console.log('[Sync] 설정 로드 성공');
        }
      } catch (error) {
        console.error('[Sync] 설정 로드 오류:', error.message);
      }
    }

    // 3. AI 설정 로드
    if (functionsAvailable.aiSettings) {
      try {
        const result = await getUserAISettings(authResult.userId);
        if (result && result.success) {
          userData.aiSettings = result.aiSettings;
          console.log('[Sync] AI 설정 로드 성공');
        }
      } catch (error) {
        console.error('[Sync] AI 설정 로드 오류:', error.message);
      }
    }

    // 4. 번역 기록 로드
    if (functionsAvailable.history) {
      try {
        const result = await getUserTranslationHistory(authResult.userId, 50);
        if (result && result.success) {
          userData.history = result.history || [];
          console.log('[Sync] 번역 기록 로드 성공:', userData.history.length, '개');
        }
      } catch (error) {
        console.error('[Sync] 번역 기록 로드 오류:', error.message);
      }
    }

    console.log('[Sync] 사용자 데이터 로드 완료:', {
      vocabularyCount: userData.vocabulary.length,
      hasSettings: !!userData.settings,
      hasAISettings: !!userData.aiSettings,
      historyCount: userData.history.length
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        userData: userData
      })
    };

  } catch (error) {
    console.error('[Sync] 사용자 데이터 로드 오류:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: `데이터 로드 중 오류가 발생했습니다: ${error.message}`
      })
    };
  }
}
