// database.js - Supabase 연결 및 기본 CRUD 함수들
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// 환경변수 체크
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[Database] 필수 환경변수 누락:', {
    SUPABASE_URL: !!supabaseUrl,
    SUPABASE_SERVICE_KEY: !!supabaseServiceKey
  });
}

const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// JWT 및 암호화 키 체크
const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-for-development-only';
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'default-encryption-secret';

// 암호화/복호화 함수들
const ENCRYPTION_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || 'default-secret', 'salt', 32);

function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptApiKey(encryptedKey) {
  try {
    const textParts = encryptedKey.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('API 키 복호화 실패:', error);
    return null;
  }
}

// 사용자 관련 함수들
async function createUser(email, password, displayName = null) {
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          display_name: displayName
        }
      ])
      .select()
      .single();

    if (userError) throw userError;

    // 사용자 데이터 초기화
    const { error: dataError } = await supabase
      .from('user_data')
      .insert([{ user_id: user.id }]);

    if (dataError) console.error('사용자 데이터 초기화 실패:', dataError);

    return { success: true, user };
  } catch (error) {
    console.error('사용자 생성 실패:', error);
    return { success: false, error: error.message };
  }
}

// database.js

// [시작점] 아래 함수 전체를 교체합니다.
// 🔐 사용자 인증 (Supabase 공식 방식으로 수정)
async function authenticateUser(email, password) {
  try {
    // 💡 supabase.auth.signInWithPassword() 공식 함수를 사용합니다.
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: password,
    });

    if (error) {
      // 로그인 실패 시 Supabase가 제공하는 에러를 반환합니다.
      return { success: false, error: error.message };
    }
    
    if (data && data.user) {
      // 로그인 성공 시, data.user 객체에는 올바른 UUID를 가진 id가 포함됩니다.
      const user = data.user;
      
      // JWT 토큰 생성
      const token = jwt.sign(
        { userId: user.id, email: user.email }, // user.id는 이제 UUID 입니다.
        process.env.JWT_SECRET || 'default-jwt-secret',
        { expiresIn: '7d' }
      );
      
      return { 
        success: true, 
        user: { 
          id: user.id, 
          email: user.email, 
          displayName: user.user_metadata?.display_name || user.email, // displayName을 user_metadata에서 가져옵니다.
          isPremium: user.user_metadata?.is_premium || false
        }, 
        token 
      };
    }

    return { success: false, error: '알 수 없는 로그인 오류가 발생했습니다.' };

  } catch (error) {
    console.error('사용자 인증 처리 중 심각한 오류:', error);
    return { success: false, error: error.message };
  }
}
// [끝점]

async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret');
    return { success: true, userId: decoded.userId, email: decoded.email };
  } catch (error) {
    return { success: false, error: '유효하지 않은 토큰입니다.' };
  }
}

// API 키 관리 함수들
async function saveUserApiKey(userId, apiKey, keyName = 'My API Key', provider = 'openai') {
  try {
    const encryptedKey = encryptApiKey(apiKey);
    
    const insertData = {
      user_id: userId,
      key_name: keyName,
      is_active: true
    };

    if (provider === 'openai') {
      insertData.encrypted_openai_key = encryptedKey;
    } else if (provider === 'google') {
      insertData.encrypted_google_key = encryptedKey;
    }

    const { data, error } = await supabase
      .from('user_api_keys')
      .upsert([insertData], { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('API 키 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

async function getUserApiKey(userId, provider = 'openai') {
  try {
    const { data, error } = await supabase
      .from('user_api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return { success: false, error: 'API 키를 찾을 수 없습니다.' };
    }

    let encryptedKey;
    if (provider === 'openai') {
      encryptedKey = data.encrypted_openai_key;
    } else if (provider === 'google') {
      encryptedKey = data.encrypted_google_key;
    }

    if (!encryptedKey) {
      return { success: false, error: `${provider} API 키가 등록되지 않았습니다.` };
    }

    const decryptedKey = decryptApiKey(encryptedKey);
    if (!decryptedKey) {
      return { success: false, error: 'API 키 복호화에 실패했습니다.' };
    }

    return { success: true, apiKey: decryptedKey };
  } catch (error) {
    console.error('API 키 조회 실패:', error);
    return { success: false, error: error.message };
  }
}

// 사용량 추적 함수들
async function trackUsage(userId, type, count = 1, cost = 0, provider = 'openai') {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing, error: selectError } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    let updateData = {};
    if (type === 'translation') {
      updateData.translation_count = (existing?.translation_count || 0) + count;
    } else if (type === 'tts') {
      updateData.tts_count = (existing?.tts_count || 0) + count;
    }
    updateData.cost_usd = (existing?.cost_usd || 0) + cost;
    updateData.api_provider = provider;

    if (existing) {
      const { error: updateError } = await supabase
        .from('usage_logs')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('usage_logs')
        .insert([{
          user_id: userId,
          date: today,
          ...updateData
        }]);

      if (insertError) throw insertError;
    }

    return { success: true };
  } catch (error) {
    console.error('사용량 추적 실패:', error);
    return { success: false, error: error.message };
  }
}

// 공용 캐시 함수들
function generateCacheKey(sourceText, targetLang) {
  return crypto.createHash('sha256').update(`${sourceText}:${targetLang}`).digest('hex');
}

async function getPublicCache(sourceText, targetLang) {
  try {
    const hashKey = generateCacheKey(sourceText, targetLang);
    
    const { data, error } = await supabase
      .from('public_cache')
      .select('*')
      .eq('hash_key', hashKey)
      .single();

    if (error || !data) {
      return { success: false, error: '캐시 데이터 없음' };
    }

    // 히트 카운트 증가
    await supabase
      .from('public_cache')
      .update({ 
        hit_count: data.hit_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.id);

    return { 
      success: true, 
      data: {
        translation: data.translation,
        pronunciation: data.pronunciation,
        hitCount: data.hit_count + 1
      }
    };
  } catch (error) {
    console.error('공용 캐시 조회 실패:', error);
    return { success: false, error: error.message };
  }
}

async function setPublicCache(sourceText, targetLang, translation, pronunciation = '') {
  try {
    const hashKey = generateCacheKey(sourceText, targetLang);
    
    const { error } = await supabase
      .from('public_cache')
      .upsert([{
        hash_key: hashKey,
        source_text: sourceText,
        target_lang: targetLang,
        translation: translation,
        pronunciation: pronunciation,
        hit_count: 1,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'hash_key',
        ignoreDuplicates: false
      });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('공용 캐시 저장 실패:', error);
    return { success: false, error: error.message };
  }
}
// ===================================================
// ⚙️ 사용자 설정 관리 함수들
// ===================================================

// 사용자 설정 저장
async function saveUserSettings(userId, settings) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_settings')
      .upsert([{
        user_id: userId,
        tts_engine: settings.ttsEngine || 'auto',
        voice_selection: settings.voiceSelection || 'nova',
        google_voice: settings.googleVoice || 'vi-VN-Standard-A',
        volume: settings.volume || 0.8,
        source_lang: settings.sourceLang || 'Korean',
        target_lang: settings.targetLang || 'Vietnamese',
        theme: settings.theme || 'light',
        pronunciation_enabled: settings.pronunciationEnabled !== false,
        auto_threshold: settings.autoThreshold || 50,
        daily_budget: settings.dailyBudget || 1.00,
        monthly_budget: settings.monthlyBudget || 30.00
      }], {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, settings: data };
  } catch (error) {
    console.error('사용자 설정 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

// 사용자 설정 로드
async function getUserSettings(userId) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // 데이터가 없으면 기본값 반환
    if (!data) {
      return {
        success: true,
        settings: {
          ttsEngine: 'auto',
          voiceSelection: 'nova',
          googleVoice: 'vi-VN-Standard-A',
          volume: 0.8,
          sourceLang: 'Korean',
          targetLang: 'Vietnamese',
          theme: 'light',
          pronunciationEnabled: true,
          autoThreshold: 50,
          dailyBudget: 1.00,
          monthlyBudget: 30.00
        }
      };
    }

    return {
      success: true,
      settings: {
        ttsEngine: data.tts_engine,
        voiceSelection: data.voice_selection,
        googleVoice: data.google_voice,
        volume: data.volume,
        sourceLang: data.source_lang,
        targetLang: data.target_lang,
        theme: data.theme,
        pronunciationEnabled: data.pronunciation_enabled,
        autoThreshold: data.auto_threshold,
        dailyBudget: data.daily_budget,
        monthlyBudget: data.monthly_budget
      }
    };
  } catch (error) {
    console.error('사용자 설정 로드 실패:', error);
    return { success: false, error: error.message };
  }
}

// ===================================================
// 🧠 AI 설정 관리 함수들
// ===================================================

// AI 설정 저장
async function saveUserAISettings(userId, aiSettings) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_ai_settings')
      .upsert([{
        user_id: userId,
        ai_context_mode: aiSettings.aiContextMode || false,
        translation_style: aiSettings.translationStyle || 'balanced',
        quality_level: aiSettings.qualityLevel || 3,
        terminology_dict: aiSettings.terminologyDict || {},
        translation_context: aiSettings.translationContext || []
      }], {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, aiSettings: data };
  } catch (error) {
    console.error('AI 설정 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

// AI 설정 로드
async function getUserAISettings(userId) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_ai_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // 데이터가 없으면 기본값 반환
    if (!data) {
      return {
        success: true,
        aiSettings: {
          aiContextMode: false,
          translationStyle: 'balanced',
          qualityLevel: 3,
          terminologyDict: {},
          translationContext: []
        }
      };
    }

    return {
      success: true,
      aiSettings: {
        aiContextMode: data.ai_context_mode,
        translationStyle: data.translation_style,
        qualityLevel: data.quality_level,
        terminologyDict: data.terminology_dict,
        translationContext: data.translation_context
      }
    };
  } catch (error) {
    console.error('AI 설정 로드 실패:', error);
    return { success: false, error: error.message };
  }
}

// ===================================================
// 📚 번역 기록 관리 함수들
// ===================================================

// 번역 기록 저장
async function saveTranslationHistory(userId, historyData) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_translation_history')
      .insert([{
        user_id: userId,
        source_text: historyData.sourceText,
        translation: historyData.translation,
        source_lang: historyData.sourceLang,
        target_lang: historyData.targetLang,
        is_ai_translation: historyData.isAI || false
      }])
      .select()
      .single();

    if (error) throw error;

    // 50개 이상이면 오래된 기록 삭제
    const { data: countData, error: countError } = await supabase
      .from('user_translation_history')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    if (!countError && countData && countData.length > 50) {
      const { error: deleteError } = await supabase
        .from('user_translation_history')
        .delete()
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(countData.length - 50);

      if (deleteError) console.error('오래된 번역 기록 삭제 실패:', deleteError);
    }

    return { success: true, history: data };
  } catch (error) {
    console.error('번역 기록 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

// 번역 기록 로드
async function getUserTranslationHistory(userId, limit = 50) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_translation_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { success: true, history: data || [] };
  } catch (error) {
    console.error('번역 기록 로드 실패:', error);
    return { success: false, error: error.message };
  }
}
// ===================================================
// 📚 단어장 관리 함수들 (누락된 함수들 완전 구현)
// ===================================================

// 사용자 단어장 전체 저장
async function saveUserVocabulary(userId, vocabularyData) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    // vocabularyData 형태 검증 및 변환 (강화된 버전)
    let vocabularyArray;
    
    console.log('[Database] 받은 단어장 데이터 타입:', typeof vocabularyData);
    console.log('[Database] 받은 단어장 데이터:', vocabularyData);
    
    if (vocabularyData instanceof Map) {
      vocabularyArray = Array.from(vocabularyData.entries());
      console.log('[Database] Map에서 배열로 변환:', vocabularyArray.length, '개');
    } else if (Array.isArray(vocabularyData)) {
      vocabularyArray = vocabularyData;
      console.log('[Database] 이미 배열 형태:', vocabularyArray.length, '개');
    } else if (vocabularyData && typeof vocabularyData === 'object') {
      // 객체 형태인 경우 entries로 변환 시도
      vocabularyArray = Object.entries(vocabularyData);
      console.log('[Database] 객체에서 배열로 변환:', vocabularyArray.length, '개');
    } else {
      console.error('[Database] 지원하지 않는 데이터 형식:', vocabularyData);
      return { success: false, error: '잘못된 단어장 데이터 형식' };
    }

    // 기존 단어장 삭제
    const { error: deleteError } = await supabase
      .from('user_vocabulary')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('기존 단어장 삭제 실패:', deleteError);
    }

    // 새 단어장 데이터 삽입
    if (vocabularyArray.length > 0) {
      const insertData = vocabularyArray.map(([original, wordData]) => ({
        user_id: userId,
        original_word: original,
        translation: wordData.translation,
        description: wordData.description || '',
        correct_count: wordData.correctCount || 0,
        wrong_count: wordData.wrongCount || 0,
        practice_time: wordData.practiceTime || 0,
        last_studied: wordData.lastStudied || null
      }));

      const { error: insertError } = await supabase
        .from('user_vocabulary')
        .insert(insertData);

      if (insertError) throw insertError;
    }

    return { success: true };
  } catch (error) {
    console.error('사용자 단어장 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

// 사용자 단어장 로드 (개선된 버전)
async function getUserVocabulary(userId) {
  try {
    if (!supabase) {
      console.error('[Database] Supabase 연결 실패');
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    console.log('[Database] 단어장 로드 시작 - 사용자 ID:', userId);

    const { data, error } = await supabase
      .from('user_vocabulary')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Database] 단어장 조회 오류:', error);
      throw error;
    }

    console.log('[Database] 조회된 단어장 데이터:', data);
    console.log('[Database] 단어장 개수:', data ? data.length : 0);

    // 데이터를 Map 형태로 변환
    const vocabularyMap = new Map();
    
    if (data && data.length > 0) {
      data.forEach(row => {
        console.log('[Database] 단어 처리:', row.original_word);
        vocabularyMap.set(row.original_word, {
          original: row.original_word,
          translation: row.translation,
          description: row.description || '',
          addedDate: row.created_at,
          correctCount: row.correct_count || 0,
          wrongCount: row.wrong_count || 0,
          practiceTime: row.practice_time || 0,
          lastStudied: row.last_studied
        });
      });
      
      console.log('[Database] Map 변환 완료 - 크기:', vocabularyMap.size);
    } else {
      console.log('[Database] 단어장 데이터 없음');
    }

    return { success: true, vocabulary: vocabularyMap };
  } catch (error) {
    console.error('[Database] 사용자 단어장 로드 실패:', error);
    return { success: false, error: error.message };
  }
}

// 개별 단어 추가
async function addUserWord(userId, wordData) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { data, error } = await supabase
      .from('user_vocabulary')
      .insert([{
        user_id: userId,
        original_word: wordData.original,
        translation: wordData.translation,
        description: wordData.description || '',
        correct_count: wordData.correctCount || 0,
        wrong_count: wordData.wrongCount || 0,
        practice_time: wordData.practiceTime || 0,
        last_studied: wordData.lastStudied || null
      }])
      .select()
      .single();

    if (error) throw error;

    return { success: true, word: data };
  } catch (error) {
    console.error('단어 추가 실패:', error);
    return { success: false, error: error.message };
  }
}

// 개별 단어 업데이트
async function updateUserWord(userId, originalWord, updateData) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const updateFields = {};
    
    if (updateData.translation !== undefined) updateFields.translation = updateData.translation;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.correctCount !== undefined) updateFields.correct_count = updateData.correctCount;
    if (updateData.wrongCount !== undefined) updateFields.wrong_count = updateData.wrongCount;
    if (updateData.practiceTime !== undefined) updateFields.practice_time = updateData.practiceTime;
    if (updateData.lastStudied !== undefined) updateFields.last_studied = updateData.lastStudied;

    const { data, error } = await supabase
      .from('user_vocabulary')
      .update(updateFields)
      .eq('user_id', userId)
      .eq('original_word', originalWord)
      .select()
      .single();

    if (error) throw error;

    return { success: true, word: data };
  } catch (error) {
    console.error('단어 업데이트 실패:', error);
    return { success: false, error: error.message };
  }
}

// 개별 단어 삭제
async function deleteUserWord(userId, originalWord) {
  try {
    if (!supabase) {
      return { success: false, error: '데이터베이스 연결 실패' };
    }

    const { error } = await supabase
      .from('user_vocabulary')
      .delete()
      .eq('user_id', userId)
      .eq('original_word', originalWord);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('단어 삭제 실패:', error);
    return { success: false, error: error.message };
  }
}
module.exports = {
  supabase,
  createUser,
  authenticateUser,
  verifyToken,
  saveUserApiKey,
  getUserApiKey,
  trackUsage,
  getPublicCache,
  setPublicCache,
  encryptApiKey,
  decryptApiKey,
 // ✨ 단어장 함수들 추가
  saveUserVocabulary,
  getUserVocabulary,
  addUserWord,
  updateUserWord,
  deleteUserWord,
  // ✨ 설정 및 AI 함수들
  saveUserSettings,
  getUserSettings,
  saveUserAISettings,
  getUserAISettings,
  saveTranslationHistory,
  getUserTranslationHistory
};