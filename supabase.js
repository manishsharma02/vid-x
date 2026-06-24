// supabase.js — load this BEFORE any inline script on every page
 
const SUPABASE_URL = 'https://kmyieimynwedgrpmrgmu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtteWllaW15bndlZGdycG1yZ211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTg2NzYsImV4cCI6MjA5NDkzNDY3Nn0.CJ1JMRSYcJGhbrztlHHWP4wIf7MIOwmUEyu8fwhEVv0';
 
// Load Supabase SDK dynamically
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
script.onload = () => {
  window.db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  console.log('%cVidX DB Connected ✅', 'color:#8b5cf6;font-weight:bold;font-size:14px;');
  if (typeof onDbReady === 'function') onDbReady();
  if (typeof loadVoteNotifications === 'function') loadVoteNotifications();
};
document.head.appendChild(script);
 
// ─── AUTH ───────────────────────────────────────────────────────────────────
 
async function getCurrentUser() {
  try {
    const { data } = await window.db.auth.getUser();
    return data?.user || null;
  } catch (e) {
    console.error('getCurrentUser:', e);
    return null;
  }
}
 
async function getUserProfile(id) {
  try {
    const { data, error } = await window.db
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('getUserProfile:', e);
    return null;
  }
}
 
// ─── REGISTER ───────────────────────────────────────────────────────────────
 
async function registerStudent(email, password, userData) {
  try {
    const { data: authData, error: authError } = await window.db.auth.signUp({
      email,
      password
    });
    if (authError) throw authError;
 
    const userId = authData.user?.id;
    if (!userId) throw new Error('Registration failed — no user ID returned.');
 
    const profile = {
      id: userId,
      email,
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      college: userData.college || '',
      branch: userData.branch || '',
      year: userData.year || '',
      experience_level: userData.experience_level || 'newbie',
      learning_level: mapExperienceToLearningLevel(userData.experience_level),
      xp: 0,
      streak: 0,
      problems_solved: 0,
      rank_title: 'Newbie'
    };
 
    const { error: insertError } = await window.db.from('users').insert(profile);
    if (insertError) throw insertError;
 
    return { success: true, user: authData.user };
  } catch (e) {
    console.error('registerStudent:', e);
    return { success: false, error: e.message || 'Registration failed.' };
  }
}
 
// ─── LOGIN ──────────────────────────────────────────────────────────────────
 
async function loginStudent(email, password) {
  try {
    const { data, error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { success: true, user: data.user };
  } catch (e) {
    console.error('loginStudent:', e);
    return { success: false, error: e.message || 'Login failed.' };
  }
}
 
// ─── PROBLEMS ───────────────────────────────────────────────────────────────
 
async function getDailyProblem() {
  try {
    const today = new Date().toISOString().split('T')[0];
 
    const { data: todayProblem } = await window.db
      .from('problems')
      .select('*')
      .eq('is_daily', true)
      .eq('daily_date', today)
      .maybeSingle();
 
    if (todayProblem) return todayProblem;
 
    const { data: anyDaily } = await window.db
      .from('problems')
      .select('*')
      .eq('is_daily', true)
      .order('daily_date', { ascending: false })
      .limit(1)
      .maybeSingle();
 
    if (anyDaily) return anyDaily;
 
    const { data: latest } = await window.db
      .from('problems')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
 
    return latest || null;
  } catch (e) {
    console.error('getDailyProblem:', e);
    return null;
  }
}
 
async function getAllProblems() {
  try {
    const { data, error } = await window.db
      .from('problems')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getAllProblems:', e);
    return [];
  }
}
 
async function getProblemById(id) {
  try {
    const { data, error } = await window.db
      .from('problems')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('getProblemById:', e);
    return null;
  }
}
 
function isSchemaOrRlsError(err) {
  const msg = (err?.message || err?.code || '').toString().toLowerCase();
  return msg.includes('schema cache') || msg.includes('column') || msg.includes('row-level security') || msg.includes('pgrst');
}
 
function buildProblemInsertPayload(data, tier) {
  const core = {
    title: data.title,
    description: data.description,
    difficulty: data.difficulty,
    topic: data.topic,
    xp_reward: data.xp_reward,
    companies: data.companies,
    sample_input: data.sample_input,
    sample_output: data.sample_output,
    is_daily: data.is_daily,
    daily_date: data.daily_date
  };
  if (tier >= 1) {
    core.test_cases = data.test_cases;
  }
  if (tier >= 2) {
    core.constraints = data.constraints;
    core.hint = data.hint;
    core.editorial = data.editorial;
    core.hidden_test_cases = data.hidden_test_cases;
  }
  return core;
}
 
async function insertProblem(problemData) {
  try {
    console.log('[VidX] insertProblem payload:', problemData);
 
    if (problemData.is_daily) {
      try {
        await window.db.from('problems').update({ is_daily: false }).eq('is_daily', true);
      } catch (e) {
        console.warn('[VidX] clear daily flag:', e);
      }
    }
 
    let lastError = null;
    for (let tier = 2; tier >= 0; tier--) {
      const payload = buildProblemInsertPayload(problemData, tier);
      const { data, error } = await window.db.from('problems').insert(payload).select().single();
      if (!error) {
        console.log('[VidX] insertProblem success (tier', tier, '):', data);
        return data;
      }
      lastError = error;
      console.warn('[VidX] insertProblem tier', tier, 'failed:', error.message);
      if (!isSchemaOrRlsError(error)) throw error;
    }
 
    throw lastError || new Error('Could not insert problem. Run schema-upgrade.sql in Supabase SQL Editor.');
  } catch (e) {
    console.error('insertProblem:', e);
    throw e;
  }
}
 
// ─── LEADERBOARD ────────────────────────────────────────────────────────────
 
async function getLeaderboard(limit = 50) {
  try {
    const { data, error } = await window.db
      .from('users')
      .select('id, first_name, last_name, email, college, branch, year, xp, streak, problems_solved, rank_title, experience_level, learning_level, placement_score, placement_readiness')
      .order('xp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getLeaderboard:', e);
    return [];
  }
}
 
async function getUserRank(userId) {
  try {
    const leaderboard = await getLeaderboard(1000);
    const index = leaderboard.findIndex(u => u.id === userId);
    return index === -1 ? null : index + 1;
  } catch (e) {
    console.error('getUserRank:', e);
    return null;
  }
}
 
// ─── XP + STREAK ────────────────────────────────────────────────────────────
 
function getRankTitle(xp) {
  if (xp >= 5000) return 'Legend';
  if (xp >= 2000) return 'Code Samurai';
  if (xp >= 500) return 'Debug Warrior';
  return 'Newbie';
}
 
async function giveXP(userId, amount) {
  try {
    // Attempt 1: Normal flow
    let profile = null;
    try {
      profile = await getUserProfile(userId);
    } catch(e) {
      console.warn('giveXP: getUserProfile failed:', e);
    }

    if (!profile) {
      // Attempt 2: Direct select + update without getUserProfile
      try {
        const { data: cur } = await window.db
          .from('users').select('xp').eq('id', userId).single();
        if (cur) {
          const newXP = (cur.xp || 0) + amount;
          const rankTitle = getRankTitle(newXP);
          await window.db.from('users')
            .update({ xp: newXP, rank_title: rankTitle }).eq('id', userId);
          return { newXP, rankTitle };
        }
      } catch(e2) {
        console.warn('giveXP: direct update failed:', e2);
      }
      // Network issue — skip XP silently, submission still saves
      console.error('giveXP: could not award XP — network issue, submission still saved');
      return null;
    }

    const newXP = (profile.xp || 0) + amount;
    const rankTitle = getRankTitle(newXP);
    const { error } = await window.db
      .from('users').update({ xp: newXP, rank_title: rankTitle }).eq('id', userId);
    if (error) throw error;
    return { newXP, rankTitle };
  } catch (e) {
    console.error('giveXP:', e);
    return null; // Never throw — submission must not fail
  }
}
 
async function updateStreak(userId) {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) throw new Error('User not found');
 
    const today = new Date().toISOString().split('T')[0];
    const lastSolved = profile.last_solved_date;
    let newStreak = profile.streak || 0;
    let streakBonus = 0;
 
    if (lastSolved === today) {
      return { streak: newStreak, streakBonus: 0 };
    }
 
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
 
    if (lastSolved === yesterdayStr) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }
 
    if (newStreak === 7) streakBonus = 25;
    if (newStreak === 30) streakBonus = 100;
 
    const { error } = await window.db
      .from('users')
      .update({ streak: newStreak, last_solved_date: today })
      .eq('id', userId);
 
    if (error) throw error;
 
    if (streakBonus > 0) await giveXP(userId, streakBonus);
 
    return { streak: newStreak, streakBonus };
  } catch (e) {
    console.error('updateStreak:', e);
    return { streak: null, streakBonus: 0 };
  }
}
 
// ─── SUBMIT ─────────────────────────────────────────────────────────────────
 
// ── XP DECAY SYSTEM ─────────────────────────────────────────────────────────
// Rules:
//   - 1st solver  → full xp_reward (from problem, e.g. 100)
//   - 2nd solver  → xp_reward - 5
//   - 3rd solver  → xp_reward - 10
//   - Nth solver  → xp_reward - (N-1)*5
//   - Floor       → 20% of xp_reward (minimum, so no one gets near 0)
//   - Wrong/Ans   → unchanged (3 XP wrong, 1 XP answer-only)
// ─────────────────────────────────────────────────────────────────────────────
 
const XP_WRONG = 3;
const XP_ANSWER_ONLY = 1;
const XP_DECAY_PER_POSITION = 5;   // XP drops by 5 each position
const XP_FLOOR_PERCENT = 0.20;     // minimum = 20% of problem's xp_reward
 
function calculateSubmissionXP(verdict, position, submissionMode, xpReward) {
  // Wrong answer or answer-only — fixed small XP, no change
  if (verdict === 'Answer Only') return XP_ANSWER_ONLY;
  if (verdict !== 'Accepted') return XP_WRONG;
 
  // Non-code submissions (answer only mode) get base
  if (submissionMode !== 'code') return Math.round(xpReward * XP_FLOOR_PERCENT) || 10;
 
  // Decay: each position after 1st loses 5 XP
  const decay = (position - 1) * XP_DECAY_PER_POSITION;
  const floor = Math.max(1, Math.round(xpReward * XP_FLOOR_PERCENT));
  const earned = Math.max(floor, xpReward - decay);
 
  return earned;
}
 
async function getAcceptedSolvePosition(problemId) {
  try {
    const { count } = await window.db
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('problem_id', problemId)
      .eq('status', 'correct');
    return (count || 0) + 1;
  } catch (e) {
    return 1;
  }
}
 
async function hasUserSolvedProblem(userId, problemId) {
  try {
    const { data } = await window.db
      .from('submissions')
      .select('id')
      .eq('user_id', userId)
      .eq('problem_id', problemId)
      .in('status', ['correct', 'Accepted'])
      .limit(1);
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
}
 
async function submitSolution(userId, problemId, options = {}) {
  try {
    const {
      verdict = 'Wrong Answer',
      language = '',
      timeTaken = 0,
      code = '',
      passedCases = 0,
      totalCases = 0,
      runtimeMs = 0,
      submissionMode = 'code'
    } = typeof options === 'string'
      ? { verdict: options === 'correct' ? 'Accepted' : 'Wrong Answer', language: arguments[3], timeTaken: arguments[4] }
      : options;
 
    const isAccepted = verdict === 'Accepted';
    let xpGained = 0;
    let position = null;
    let streakBonus = 0;
    const alreadySolved = await hasUserSolvedProblem(userId, problemId);
 
    // Fetch problem to get its xp_reward for the decay formula
    const problem = await getProblemById(problemId);
    const xpReward = problem?.xp_reward || 100;
 
    if (isAccepted) {
      position = await getAcceptedSolvePosition(problemId);
      xpGained = calculateSubmissionXP(verdict, position, submissionMode, xpReward);
 
      await giveXP(userId, xpGained);
      const streakResult = await updateStreak(userId);
      streakBonus = streakResult?.streakBonus || 0;
      xpGained += streakBonus;
 
      if (!alreadySolved) {
        const profile = await getUserProfile(userId);
        await window.db
          .from('users')
          .update({ problems_solved: (profile?.problems_solved || 0) + 1 })
          .eq('id', userId);
 
        await window.db
          .from('problems')
          .update({
            solve_count: (problem?.solve_count || 0) + 1,
            correct_submission_count: (problem?.correct_submission_count || 0) + 1
          })
          .eq('id', problemId);
      }
    } else if (verdict === 'Answer Only') {
      xpGained = XP_ANSWER_ONLY;
      await giveXP(userId, xpGained);
    } else {
      xpGained = XP_WRONG;
      await giveXP(userId, xpGained);
    }
 
    const row = {
      user_id: userId,
      problem_id: problemId,
      status: isAccepted ? 'correct' : (verdict === 'Answer Only' ? 'answer' : 'wrong'),
      language,
      xp_gained: xpGained,
      time_taken_mins: timeTaken || 0,
      verdict,
      code: code || null,
      passed_cases: passedCases,
      total_cases: totalCases,
      runtime_ms: runtimeMs
    };
 
    const { error } = await window.db.from('submissions').insert(row);
    if (error) {
      const { error: fallbackErr } = await window.db.from('submissions').insert({
        user_id: userId,
        problem_id: problemId,
        status: row.status,
        language,
        xp_gained: xpGained,
        time_taken_mins: timeTaken || 0
      });
      if (fallbackErr) throw fallbackErr;
    }

    let levelPromotion = null;
    if (isAccepted) {
      levelPromotion = await checkAndPromoteLearningLevel(userId);
    }

    return {
      xpGained,
      position,
      streakBonus,
      isWrong: !isAccepted,
      verdict,
      passedCases,
      totalCases,
      runtimeMs,
      alreadySolved,
      levelPromotion
    };
  } catch (e) {
    console.error('submitSolution:', e);
    return { xpGained: 0, position: null, isWrong: true, error: e.message };
  }
}
 
// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
 
function getNotificationTitle(n) {
  if (n.title) return n.title;
  const types = { admin: '📢 Admin Notice', system: '⚙️ System', vote: '🗳️ Vote Update', xp: '⭐ XP Update' };
  return types[n.type] || '📬 Notification';
}
 
async function getNotifications(userId, limit = 50) {
  try {
    const { data, error } = await window.db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getNotifications:', e);
    return [];
  }
}
 
async function getUnreadNotificationCount(userId) {
  try {
    const { count, error } = await window.db
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('getUnreadNotificationCount:', e);
    return 0;
  }
}
 
async function markNotificationRead(id) {
  try {
    const { error } = await window.db
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('markNotificationRead:', e);
    return false;
  }
}
 
async function markAllNotificationsRead(userId) {
  try {
    const { error } = await window.db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('markAllNotificationsRead:', e);
    return false;
  }
}
 
async function sendNotificationToAll(message, title = 'Admin Notice') {
  try {
    const students = await adminGetAllStudents();
    if (!students.length) return { success: false, error: 'No students found.' };
 
    const withTitle = students.map(s => ({
      user_id: s.id,
      title,
      message,
      type: 'admin',
      is_read: false
    }));
    const withoutTitle = students.map(s => ({
      user_id: s.id,
      message,
      type: 'admin',
      is_read: false
    }));
 
    const attempts = [withTitle, withoutTitle];
    let lastError = null;
 
    for (const rows of attempts) {
      const { error } = await window.db.from('notifications').insert(rows);
      if (!error) return { success: true, count: rows.length };
      lastError = error;
      console.warn('[VidX] batch notification insert failed:', error.message);
 
      if (isSchemaOrRlsError(error)) {
        let sent = 0;
        for (const row of rows) {
          const { error: oneErr } = await window.db.from('notifications').insert(row);
          if (!oneErr) sent++;
          else lastError = oneErr;
        }
        if (sent > 0) return { success: true, count: sent };
      } else {
        throw error;
      }
    }
 
    const hint = isSchemaOrRlsError(lastError)
      ? ' Run schema-upgrade.sql in Supabase SQL Editor to fix RLS policies.'
      : '';
    return { success: false, error: (lastError?.message || 'Insert failed.') + hint };
  } catch (e) {
    console.error('sendNotificationToAll:', e);
    const hint = isSchemaOrRlsError(e) ? ' Run schema-upgrade.sql in Supabase SQL Editor.' : '';
    return { success: false, error: (e.message || 'Insert failed.') + hint };
  }
}
 
// ─── VOTING ─────────────────────────────────────────────────────────────────
 
async function getTodayVote(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await window.db
      .from('problem_votes')
      .select('*')
      .eq('user_id', userId)
      .eq('vote_date', today)
      .maybeSingle();
    return data;
  } catch (e) {
    console.error('getTodayVote:', e);
    return null;
  }
}
 
async function submitVote(userId, voteFor, studentName, studentEmail) {
  try {
    const existing = await getTodayVote(userId);
    if (existing) return { success: false, error: 'You already voted today.' };
 
    const today = new Date().toISOString().split('T')[0];
 
    const { error: voteError } = await window.db.from('problem_votes').insert({
      user_id: userId,
      vote_for: voteFor,
      vote_date: today
    });
    if (voteError) throw voteError;
 
    await window.db.from('vote_notifications').insert({
      student_id: userId,
      student_name: studentName,
      student_email: studentEmail,
      topic: voteFor,
      is_read: false
    });
 
    return { success: true };
  } catch (e) {
    console.error('submitVote:', e);
    return { success: false, error: e.message };
  }
}
 
async function getVoteCounts(dateFilter = null) {
  try {
    let query = window.db.from('problem_votes').select('vote_for, vote_date');
    if (dateFilter) query = query.eq('vote_date', dateFilter);
    const { data, error } = await query;
    if (error) throw error;
 
    const counts = {};
    (data || []).forEach(v => {
      counts[v.vote_for] = (counts[v.vote_for] || 0) + 1;
    });
    return counts;
  } catch (e) {
    console.error('getVoteCounts:', e);
    return {};
  }
}
 
async function getAllVotes(filters = {}) {
  try {
    let query = window.db.from('problem_votes').select('*').order('vote_date', { ascending: false });
    if (filters.date) query = query.eq('vote_date', filters.date);
    if (filters.topic) query = query.eq('vote_for', filters.topic);
    const { data, error } = await query;
    if (error) throw error;
 
    const students = await adminGetAllStudents();
    const sm = {};
    students.forEach(s => { sm[s.id] = s; });
 
    return (data || []).map(v => {
      const s = sm[v.user_id];
      return {
        ...v,
        student_name: s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : 'Unknown',
        student_email: s?.email || ''
      };
    });
  } catch (e) {
    console.error('getAllVotes:', e);
    return [];
  }
}
 
async function getVoteAnalytics() {
  try {
    const { data, error } = await window.db.from('problem_votes').select('vote_for, vote_date');
    if (error) throw error;
    const votes = data || [];
 
    const topicCounts = {};
    const dailyCounts = {};
    votes.forEach(v => {
      topicCounts[v.vote_for] = (topicCounts[v.vote_for] || 0) + 1;
      dailyCounts[v.vote_date] = (dailyCounts[v.vote_date] || 0) + 1;
    });
 
    const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
    return {
      topicCounts,
      dailyCounts,
      totalVotes: votes.length,
      mostVoted: sorted[0] || null,
      leastVoted: sorted.length ? sorted[sorted.length - 1] : null,
      leaderboard: sorted
    };
  } catch (e) {
    console.error('getVoteAnalytics:', e);
    return { topicCounts: {}, dailyCounts: {}, totalVotes: 0, mostVoted: null, leastVoted: null, leaderboard: [] };
  }
}
 
async function getVoteNotifications() {
  try {
    const { data, error } = await window.db
      .from('vote_notifications')
      .select('*')
      .order('voted_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getVoteNotifications:', e);
    return [];
  }
}
 
async function markVoteNotificationsRead() {
  try {
    const { error } = await window.db
      .from('vote_notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('markVoteNotificationsRead:', e);
    return false;
  }
}
 
// ─── ADMIN ──────────────────────────────────────────────────────────────────
 
async function adminGetAllStudents() {
  try {
    const { data, error } = await window.db
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('adminGetAllStudents:', e);
    return [];
  }
}
 
async function adminUpdateXP(userId, newXP) {
  try {
    const rankTitle = getRankTitle(newXP);
    const { error } = await window.db
      .from('users')
      .update({ xp: newXP, rank_title: rankTitle })
      .eq('id', userId);
    if (error) throw error;
    return { success: true, rankTitle };
  } catch (e) {
    console.error('adminUpdateXP:', e);
    return { success: false, error: e.message };
  }
}
 
async function adminResetStreak(userId) {
  try {
    const { error } = await window.db
      .from('users')
      .update({ streak: 0, last_solved_date: null })
      .eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.error('adminResetStreak:', e);
    return { success: false, error: e.message };
  }
}
 
// ─── AUTH GUARDS ────────────────────────────────────────────────────────────
 
async function requireAuth() {
  try {
    const { data: sessionData } = await window.db.auth.getSession();
    if (sessionData?.session?.user) {
      return sessionData.session.user;
    }
    const { data: userData } = await window.db.auth.getUser();
    if (userData?.user) {
      return userData.user;
    }
    window.location.href = 'login.html';
    return null;
  } catch (e) {
    console.error('requireAuth:', e);
    const { data: fallback } = await window.db.auth.getSession().catch(() => ({ data: null }));
    if (fallback?.session?.user) return fallback.session.user;
    window.location.href = 'login.html';
    return null;
  }
}
 
function requireAdmin() {
  if (!sessionStorage.getItem('vidx_admin')) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}
 
async function logout() {
  try {
    await window.db.auth.signOut();
    sessionStorage.removeItem('vidx_admin');
    sessionStorage.removeItem('vidx_placement');
    window.location.href = 'login.html';
  } catch (e) {
    console.error('logout:', e);
    window.location.href = 'login.html';
  }
}
 
// ─── UTILITIES ──────────────────────────────────────────────────────────────
 
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
 
function getInitials(firstName, lastName) {
  const f = (firstName || '')[0] || '';
  const l = (lastName || '')[0] || '';
  return (f + l).toUpperCase() || '?';
}
 
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
 
function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s, formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '00')}:${String(s).padStart(2, '0')}` };
}
 
// ─── PROBLEM LIBRARY ────────────────────────────────────────────────────────
 
async function getUserSolvedProblemIds(userId) {
  try {
    const { data } = await window.db
      .from('submissions')
      .select('problem_id')
      .eq('user_id', userId)
      .in('status', ['correct', 'Accepted']);
    return [...new Set((data || []).map(s => s.problem_id))];
  } catch (e) {
    console.error('getUserSolvedProblemIds:', e);
    return [];
  }
}
 
async function getProblemStats(problemId) {
  try {
    const { data: subs } = await window.db
      .from('submissions')
      .select('status, verdict')
      .eq('problem_id', problemId);
 
    const total = (subs || []).length;
    const accepted = (subs || []).filter(s =>
      s.status === 'correct' || s.verdict === 'Accepted'
    ).length;
 
    return {
      totalAttempts: total,
      totalAccepted: accepted,
      successRate: total ? Math.round((accepted / total) * 100) : 0
    };
  } catch (e) {
    return { totalAttempts: 0, totalAccepted: 0, successRate: 0 };
  }
}
 
async function getRelatedProblems(problem, limit = 4) {
  try {
    const all = await getAllProblems();
    return all
      .filter(p => p.id !== problem.id && (p.topic === problem.topic || (p.companies || []).some(c => (problem.companies || []).includes(c))))
      .slice(0, limit);
  } catch (e) {
    return [];
  }
}
 
function filterProblems(problems, filters = {}) {
  let result = [...problems];
  const { search, difficulty, topic, company, status, solvedIds, bookmarkedIds, sort } = filters;
 
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.topic || '').toLowerCase().includes(q)
    );
  }
  if (difficulty && difficulty !== 'all') {
    result = result.filter(p => (p.difficulty || '').toLowerCase() === difficulty.toLowerCase());
  }
  if (topic && topic !== 'all') {
    result = result.filter(p => (p.topic || '') === topic);
  }
  if (company && company !== 'all') {
    result = result.filter(p => (p.companies || []).includes(company));
  }
  if (status === 'solved' && solvedIds) {
    result = result.filter(p => solvedIds.includes(p.id));
  }
  if (status === 'unsolved' && solvedIds) {
    result = result.filter(p => !solvedIds.includes(p.id));
  }
  if (status === 'bookmarked' && bookmarkedIds) {
    result = result.filter(p => bookmarkedIds.includes(p.id));
  }
 
  if (sort === 'newest') {
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === 'solved') {
    result.sort((a, b) => (b.solve_count || 0) - (a.solve_count || 0));
  } else if (sort === 'xp') {
    result.sort((a, b) => (b.xp_reward || 0) - (a.xp_reward || 0));
  } else if (sort === 'difficulty') {
    const order = { Beginner: 1, Intermediate: 2, Advanced: 3 };
    result.sort((a, b) => (order[a.difficulty] || 0) - (order[b.difficulty] || 0));
  }
 
  return result;
}
 
// ─── BOOKMARKS & LIKES ──────────────────────────────────────────────────────
 
function _bookmarkKey(userId) { return `vidx_bookmarks_${userId}`; }
function _likesKey(userId) { return `vidx_likes_${userId}`; }
 
async function getBookmarkedProblems(userId) {
  try {
    const { data } = await window.db.from('problem_bookmarks').select('problem_id').eq('user_id', userId);
    if (data) return data.map(b => b.problem_id);
  } catch (e) { /* fallback */ }
  try {
    return JSON.parse(localStorage.getItem(_bookmarkKey(userId)) || '[]');
  } catch (e) { return []; }
}
 
async function toggleBookmark(userId, problemId) {
  const local = JSON.parse(localStorage.getItem(_bookmarkKey(userId)) || '[]');
  const idx = local.indexOf(problemId);
  const isBookmarked = idx === -1;
  if (isBookmarked) local.push(problemId); else local.splice(idx, 1);
  localStorage.setItem(_bookmarkKey(userId), JSON.stringify(local));
 
  try {
    if (isBookmarked) {
      await window.db.from('problem_bookmarks').insert({ user_id: userId, problem_id: problemId });
    } else {
      await window.db.from('problem_bookmarks').delete().eq('user_id', userId).eq('problem_id', problemId);
    }
  } catch (e) { /* localStorage is source of truth */ }
 
  return isBookmarked;
}
 
async function getLikedProblems(userId) {
  try {
    return JSON.parse(localStorage.getItem(_likesKey(userId)) || '[]');
  } catch (e) { return []; }
}
 
async function toggleLike(userId, problemId) {
  const local = JSON.parse(localStorage.getItem(_likesKey(userId)) || '[]');
  const idx = local.indexOf(problemId);
  const isLiked = idx === -1;
  if (isLiked) local.push(problemId); else local.splice(idx, 1);
  localStorage.setItem(_likesKey(userId), JSON.stringify(local));
 
  try {
    if (isLiked) {
      await window.db.from('problem_likes').insert({ user_id: userId, problem_id: problemId });
    } else {
      await window.db.from('problem_likes').delete().eq('user_id', userId).eq('problem_id', problemId);
    }
  } catch (e) { /* ok */ }
 
  return isLiked;
}
 
// ─── CODE EXECUTION ──────────────────────────────────────────────────────────
// Primary: Judge0 CE (ce.judge0.com) — free tier, may rate limit
// Fallback 1: Judge0 Extra CE (extra.judge0.com) — separate free instance
// Fallback 2: Glot.io — open API, no auth needed
// Note: Piston (emkc.org) is whitelist-only since Feb 2026 — removed
 
const JUDGE0_URL = 'https://ce.judge0.com/submissions?base64_encoded=false&wait=true';
const JUDGE0_EXTRA_URL = 'https://extra.judge0.com/submissions?base64_encoded=false&wait=true';
const GLOT_URL = 'https://glot.io/api/run';
 
const LANG_CONFIG = {
  python:     { language_id: 71,  label: 'Python 3',   glot: { language: 'python',     version: 'latest', filename: 'main.py'   } },
  java:       { language_id: 62,  label: 'Java',        glot: { language: 'java',       version: 'latest', filename: 'Main.java' } },
  cpp:        { language_id: 54,  label: 'C++',         glot: { language: 'cpp',        version: 'latest', filename: 'main.cpp'  } },
  javascript: { language_id: 63,  label: 'JavaScript',  glot: { language: 'javascript', version: 'latest', filename: 'main.js'   } }
};
 
// ── Glot.io fallback (no API key needed for basic use) ──────────────────────
async function executeViaGlot(langKey, code, stdin) {
  const cfg = LANG_CONFIG[langKey];
  if (!cfg?.glot) throw new Error('Unsupported language for Glot');
  const res = await fetch(`${GLOT_URL}/${cfg.glot.language}/${cfg.glot.version}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: cfg.glot.filename, content: code }],
      stdin: stdin || ''
    })
  });
  if (!res.ok) throw new Error(`Glot HTTP ${res.status}`);
  const data = await res.json();
  const stdout = data.run?.stdout || '';
  const stderr = data.run?.stderr || data.run?.error || '';
  return { stdout, stderr, code: stderr ? 1 : 0, runtimeMs: 0, memoryKb: 0 };
}
 
// ── Single Judge0 instance call ──────────────────────────────────────────────
async function executeViaJudge0(url, langKey, code, stdin, timeoutMs) {
  const cfg = LANG_CONFIG[langKey];
  if (!cfg) throw new Error('Unsupported language');
  const cpuLimit = Math.max(2, Math.ceil(timeoutMs / 1000));
  const payload = {
    source_code: code,
    language_id: cfg.language_id,
    stdin: stdin || '',
    cpu_time_limit: cpuLimit,
    memory_limit: 128000
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    clearTimeout(timer);
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Invalid response from execution service'); }
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    const statusId = data.status?.id;
    const stdout = data.stdout ?? '';
    const stderr = data.stderr ?? data.compile_output ?? '';
    const runtimeMs = Math.round(parseFloat(data.time || 0) * 1000);
    const memoryKb = data.memory || 0;
    if (statusId === 5) return { stdout, stderr, error: 'Time Limit Exceeded', tle: true, code: 1, runtimeMs, memoryKb };
    if (statusId === 6) return { stdout, stderr: stderr || 'Compilation Error', code: 1, runtimeMs, memoryKb };
    if (statusId === 11 || statusId === 12) return { stdout, stderr: stderr || 'Runtime Error', code: 1, runtimeMs, memoryKb };
    const exitCode = (statusId === 3 || statusId === 4) ? 0 : (statusId > 3 ? 1 : 0);
    return { stdout, stderr, code: exitCode, runtimeMs, memoryKb };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return { error: 'Time Limit Exceeded', tle: true, stdout: '', stderr: '' };
    throw e;
  }
}
 
// ── Main executeCode — tries Judge0 CE → Judge0 Extra → Glot ────────────────
async function executeCode(langKey, code, stdin = '', timeoutMs = 10000) {
  // Try primary Judge0
  try {
    const result = await executeViaJudge0(JUDGE0_URL, langKey, code, stdin, timeoutMs);
    console.log('[VidX Execute] Judge0 CE success');
    return result;
  } catch (e) {
    console.warn('[VidX Execute] Judge0 CE failed:', e.message);
  }
 
  // Try extra Judge0 instance
  try {
    const result = await executeViaJudge0(JUDGE0_EXTRA_URL, langKey, code, stdin, timeoutMs);
    console.log('[VidX Execute] Judge0 Extra success');
    return result;
  } catch (e) {
    console.warn('[VidX Execute] Judge0 Extra failed:', e.message);
  }
 
  // Try Glot.io
  try {
    const result = await executeViaGlot(langKey, code, stdin);
    console.log('[VidX Execute] Glot fallback success');
    return result;
  } catch (e) {
    console.warn('[VidX Execute] Glot failed:', e.message);
  }
 
  // All failed
  throw new Error('All code execution services are currently unavailable. Please try again in a moment.');
}
 
/** @deprecated Use executeCode — kept for backward compatibility */
async function executePistonCode(langKey, code, stdin = '', timeoutMs = 10000) {
  return executeCode(langKey, code, stdin, timeoutMs);
}
 
// ── Keep old name for backward compat ───────────────────────────────────────
async function executeViaPiston(langKey, code, stdin) {
  return executeViaGlot(langKey, code, stdin);
}
 
function normalizeOutput(s) {
  if (!s) return '';

  // Step 1: Normalize Windows line endings
  let result = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Step 2: Trim each line individually (removes trailing spaces per line)
  const lines = result.split('\n').map(line => line.trimEnd());

  // Step 3: Remove trailing empty lines only
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Step 4: Join lines back
  result = lines.join('\n');

  // Step 5: If single line — apply bracket/comma cleanup (for array outputs)
  if (!result.includes('\n')) {
    result = result
      .replace(/^\[+/, '').replace(/\]+$/, '')   // remove [ ] wrappers
      .replace(/,\s*/g, ' ')                      // commas → space
      .replace(/\s+/g, ' ')                       // multiple spaces → one
      .trim();
  }

  return result.trim();
}
function formatExecutionOutput(result) {
  const stdout = (result.stdout || '').replace(/\r\n/g, '\n').trimEnd();
  const stderr = (result.stderr || '').replace(/\r\n/g, '\n').trimEnd();
  if (stdout) return stdout;
  if (stderr) return stderr;
  return '(no output)';
}

/** Shared test-case parser — used by Daily Problems and Battles (same judging input). */
function getProblemTestCases(problem) {
  if (!problem) return [];
  let visible = [];
  let hidden = [];
  try {
    visible = typeof problem.test_cases === 'string'
      ? JSON.parse(problem.test_cases)
      : (problem.test_cases || []);
    hidden = typeof problem.hidden_test_cases === 'string'
      ? JSON.parse(problem.hidden_test_cases)
      : (problem.hidden_test_cases || []);
  } catch (e) {
    console.warn('[VidX] test case parse error:', e);
  }
  const merged = [...(Array.isArray(visible) ? visible : []), ...(Array.isArray(hidden) ? hidden : [])];
  if (!merged.length && problem.sample_input) {
    return [{ input: problem.sample_input, expected: problem.sample_output }];
  }
  return merged;
}

async function judgeSubmission(langKey, code, testCases, timeoutMs = 8000, onProgress) {
  let cases = Array.isArray(testCases) && testCases.length ? testCases : [];

  if (!cases.length) {
    console.warn('[VidX Judge] No test_cases found — cannot judge submission.');
    return {
      verdict: 'Wrong Answer',
      passed: 0,
      total: 0,
      failedCase: { error: 'No test cases configured for this problem. Ask admin to add test cases.' },
      runtimeMs: 0
    };
  }

  let passed = 0;
  let totalRuntime = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    if (typeof onProgress === 'function') onProgress(i + 1, cases.length);
    try {
      const result = await Promise.race([
        executeCode(langKey, code, tc.input || '', timeoutMs),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Time Limit Exceeded')), timeoutMs + 6000))
      ]);

      if (result.tle || result.error === 'Time Limit Exceeded') {
        return { verdict: 'Time Limit Exceeded', passed, total: cases.length, failedCase: { index: i + 1, reason: 'TLE' }, runtimeMs: totalRuntime };
      }
      if (result.code !== 0 && result.code !== undefined) {
        return { verdict: 'Runtime Error', passed, total: cases.length, failedCase: { index: i + 1, stderr: result.stderr, stdout: result.stdout }, runtimeMs: totalRuntime };
      }
      totalRuntime += result.runtimeMs || 0;
      const actual = normalizeOutput(result.stdout);
      const expected = normalizeOutput(tc.expected || tc.expected_output || tc.output || '');
      if (actual !== expected) {
        return { verdict: 'Wrong Answer', passed, total: cases.length, failedCase: { index: i + 1, input: tc.input, expected, actual }, runtimeMs: totalRuntime };
      }
      passed++;
    } catch (e) {
      const msg = e.message || 'Runtime Error';
      return {
        verdict: msg.includes('Time Limit') ? 'Time Limit Exceeded' : 'Runtime Error',
        passed,
        total: cases.length,
        failedCase: { index: i + 1, error: msg },
        runtimeMs: totalRuntime
      };
    }
  }

  return { verdict: 'Accepted', passed, total: cases.length, failedCase: null, runtimeMs: totalRuntime };
}
 
// ─── UPDATE USER PROFILE ────────────────────────────────────────────────────
 
async function updateUserProfile(userId, updates) {
  try {
    const { error } = await window.db
      .from('users')
      .update(updates)
      .eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.error('updateUserProfile:', e);
    return { success: false, error: e.message };
  }
}

// ─── LEARNING LEVEL PROGRESSION ─────────────────────────────────────────────

const LEARNING_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const LEVEL_RANK = { Beginner: 1, Intermediate: 2, Advanced: 3 };

const LEVEL_PROMOTION = {
  Beginner: { next: 'Intermediate', requiredSolves: 10, difficulty: ['Easy', 'Beginner'] },
  Intermediate: { next: 'Advanced', requiredSolves: 15, difficulty: ['Medium', 'Intermediate'] }
};

function mapExperienceToLearningLevel(experience) {
  const e = (experience || 'newbie').toLowerCase();
  if (e === 'advanced' || e === 'expert') return 'Advanced';
  if (e === 'intermediate' || e === 'some') return 'Intermediate';
  return 'Beginner';
}

function getStudentLearningLevel(profile) {
  return profile?.learning_level || mapExperienceToLearningLevel(profile?.experience_level);
}

function difficultyToLearningLevel(difficulty) {
  const d = (difficulty || 'Easy').toLowerCase();
  if (d === 'hard' || d === 'advanced') return 'Advanced';
  if (d === 'medium' || d === 'intermediate') return 'Intermediate';
  return 'Beginner';
}

function canStudentSubmitProblem(profile, problem) {
  const studentLevel = getStudentLearningLevel(profile);
  const problemLevel = difficultyToLearningLevel(problem?.difficulty);
  return (LEVEL_RANK[studentLevel] || 1) >= (LEVEL_RANK[problemLevel] || 1);
}

function getLevelUnlockMessage(profile, problem) {
  const studentLevel = getStudentLearningLevel(profile);
  const problemLevel = difficultyToLearningLevel(problem?.difficulty);
  const rule = LEVEL_PROMOTION[studentLevel];
  const need = rule ? `${rule.requiredSolves} ${rule.difficulty.join('/')} problems solved` : 'Complete previous level';
  return {
    locked: !canStudentSubmitProblem(profile, problem),
    studentLevel,
    problemLevel,
    message: `This is a ${problemLevel} problem. You are currently ${studentLevel}. Solve ${need} to unlock ${rule?.next || 'the next level'}.`
  };
}

async function countLevelSolves(userId, difficulties) {
  try {
    const { data: subs } = await window.db
      .from('submissions')
      .select('problem_id')
      .eq('user_id', userId)
      .eq('status', 'correct');
    const ids = [...new Set((subs || []).map(s => s.problem_id))];
    if (!ids.length) return 0;
    const { data: probs } = await window.db.from('problems').select('id, difficulty').in('id', ids);
    const diffSet = difficulties.map(d => d.toLowerCase());
    return (probs || []).filter(p => diffSet.includes((p.difficulty || 'Easy').toLowerCase())).length;
  } catch (e) {
    return 0;
  }
}

async function checkAndPromoteLearningLevel(userId) {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) return null;
    const current = getStudentLearningLevel(profile);
    const rule = LEVEL_PROMOTION[current];
    if (!rule) return { level: current, promoted: false };

    const solves = await countLevelSolves(userId, rule.difficulty);
    if (solves < rule.requiredSolves) {
      return { level: current, promoted: false, progress: solves, required: rule.requiredSolves };
    }

    await window.db.from('users').update({ learning_level: rule.next }).eq('id', userId);
    try {
      await window.db.from('notifications').insert({
        user_id: userId,
        title: '🎓 Level Up!',
        message: `Congratulations! You advanced to ${rule.next} level. New problems are now unlocked.`,
        type: 'system',
        is_read: false
      });
    } catch (e) { /* optional */ }

    return { level: rule.next, promoted: true, from: current };
  } catch (e) {
    console.error('checkAndPromoteLearningLevel:', e);
    return null;
  }
}

async function getLeaderboardByLevel(level, limit = 5) {
  const all = await getLeaderboard(200);
  return all.filter(s => getStudentLearningLevel(s) === level).slice(0, limit);
}

async function getLevelProgress(userId) {
  const profile = await getUserProfile(userId);
  const level = getStudentLearningLevel(profile);
  const rule = LEVEL_PROMOTION[level];
  if (!rule) return { level, complete: true };
  const solves = await countLevelSolves(userId, rule.difficulty);
  return {
    level,
    next: rule.next,
    solves,
    required: rule.requiredSolves,
    percent: Math.min(100, Math.round((solves / rule.requiredSolves) * 100))
  };
}

// ─── PLACEMENT CELL ─────────────────────────────────────────────────────────

function requirePlacementAdmin() {
  if (sessionStorage.getItem('vidx_placement') || sessionStorage.getItem('vidx_admin')) return true;
  window.location.href = 'login.html';
  return false;
}

function isStudentEligibleForPlacement(profile, item) {
  if (!profile || !item) return false;
  const branches = item.eligible_branches || [];
  const years = item.eligible_years || [];
  const batches = item.eligible_batches || [];
  const studentIds = item.eligible_student_ids || [];
  if (studentIds.length && !studentIds.includes(profile.id)) return false;
  if (branches.length && !branches.includes(profile.branch)) return false;
  if (years.length && !years.includes(String(profile.year))) return false;
  if (batches.length && !batches.includes(profile.college)) return false;
  return true;
}

async function getPlacementCompanies() {
  try {
    const { data, error } = await window.db.from('placement_companies').select('*').order('name');
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

async function savePlacementCompany(payload) {
  try {
    const { data, error } = await window.db.from('placement_companies').upsert(payload).select().single();
    if (error) throw error;
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
}

async function deletePlacementCompany(id) {
  try {
    const { error } = await window.db.from('placement_companies').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function getPlacementDrives(filters = {}) {
  try {
    let q = window.db.from('placement_drives').select('*, placement_companies(name, logo_url, package_ctc)').order('drive_date', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).filter(d => {
      if (filters.upcoming && new Date(d.registration_deadline || d.drive_date) < new Date()) return false;
      return true;
    });
  } catch (e) { return []; }
}

async function savePlacementDrive(payload) {
  try {
    const { data, error } = await window.db.from('placement_drives').upsert(payload).select().single();
    if (error) throw error;
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
}

async function getPlacementTests() {
  try {
    const { data, error } = await window.db.from('placement_tests').select('*').order('start_time', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

async function getPlacementTestById(id) {
  try {
    const { data, error } = await window.db.from('placement_tests').select('*').eq('id', id).single();
    if (error) throw error;
    const { data: questions } = await window.db.from('placement_test_questions').select('*').eq('test_id', id).order('sort_order');
    return { ...data, questions: questions || [] };
  } catch (e) { return null; }
}

async function savePlacementTest(test, questions) {
  try {
    const { id, ...rest } = test;
    let testId = id;
    if (testId) {
      const { error } = await window.db.from('placement_tests').update(rest).eq('id', testId);
      if (error) throw error;
      await window.db.from('placement_test_questions').delete().eq('test_id', testId);
    } else {
      const { data, error } = await window.db.from('placement_tests').insert(rest).select().single();
      if (error) throw error;
      testId = data.id;
    }
    if (questions?.length) {
      const rows = questions.map((q, i) => ({ ...q, test_id: testId, sort_order: i }));
      const { error: qErr } = await window.db.from('placement_test_questions').insert(rows);
      if (qErr) throw qErr;
    }
    return { success: true, id: testId };
  } catch (e) { return { success: false, error: e.message }; }
}

async function deletePlacementTest(id) {
  try {
    await window.db.from('placement_test_questions').delete().eq('test_id', id);
    const { error } = await window.db.from('placement_tests').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function registerForDrive(userId, driveId) {
  try {
    const { error } = await window.db.from('placement_registrations').upsert({
      user_id: userId, drive_id: driveId, status: 'registered'
    }, { onConflict: 'user_id,drive_id' });
    if (error) throw error;
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function getStudentPlacementDashboard(userId) {
  try {
    const profile = await getUserProfile(userId);
    const [drives, tests, regs, attempts] = await Promise.all([
      getPlacementDrives(),
      getPlacementTests(),
      window.db.from('placement_registrations').select('*').eq('user_id', userId).then(r => r.data || []),
      window.db.from('placement_test_attempts').select('*').eq('user_id', userId).then(r => r.data || [])
    ]);
    const regDriveIds = new Set(regs.map(r => r.drive_id));
    const eligibleDrives = drives.filter(d => isStudentEligibleForPlacement(profile, d));
    const eligibleTests = tests.filter(t => t.is_published && isStudentEligibleForPlacement(profile, t));
    return {
      profile,
      upcomingDrives: eligibleDrives.filter(d => new Date(d.drive_date) >= new Date()),
      upcomingTests: eligibleTests.filter(t => new Date(t.end_time) >= new Date()),
      appliedDrives: eligibleDrives.filter(d => regDriveIds.has(d.id)),
      attempts,
      placementScore: profile?.placement_score || 0,
      placementReadiness: profile?.placement_readiness || 0,
      status: profile?.placement_status || {}
    };
  } catch (e) {
    console.error('getStudentPlacementDashboard:', e);
    return null;
  }
}

async function startPlacementAttempt(userId, testId) {
  try {
    const now = new Date().toISOString();
    const { data, error } = await window.db.from('placement_test_attempts').insert({
      user_id: userId,
      test_id: testId,
      started_at: now,
      status: 'in_progress',
      risk_score: 0,
      violation_count: 0
    }).select().single();
    if (error) throw error;
    return { success: true, attempt: data };
  } catch (e) { return { success: false, error: e.message }; }
}

async function submitPlacementAttempt(attemptId, answers, proctorSummary) {
  try {
    const { data: attempt } = await window.db.from('placement_test_attempts').select('*').eq('id', attemptId).single();
    if (!attempt) throw new Error('Attempt not found');
    const test = await getPlacementTestById(attempt.test_id);
    let score = 0;
    let maxScore = 0;
    (test.questions || []).forEach(q => {
      maxScore += q.marks || 1;
      const ans = answers[q.id];
      if (q.question_type === 'mcq' && ans === q.correct_option) score += q.marks || 1;
      else if (q.question_type === 'coding' && ans?.verdict === 'Accepted') score += q.marks || 1;
    });
    const risk = proctorSummary?.riskScore || attempt.risk_score || 0;
    await window.db.from('placement_test_answers').insert(
      Object.entries(answers).map(([questionId, answer]) => ({
        attempt_id: attemptId,
        question_id: questionId,
        answer: typeof answer === 'object' ? answer : { value: answer }
      }))
    );
    await window.db.from('placement_test_attempts').update({
      status: 'completed',
      submitted_at: new Date().toISOString(),
      score,
      max_score: maxScore,
      risk_score: risk,
      violation_count: proctorSummary?.violationCount || attempt.violation_count || 0
    }).eq('id', attemptId);
    await window.db.from('users').update({
      placement_score: score,
      placement_readiness: Math.min(100, Math.round((score / Math.max(maxScore, 1)) * 70 + (100 - risk) * 0.3))
    }).eq('id', attempt.user_id);
    return { success: true, score, maxScore, risk };
  } catch (e) { return { success: false, error: e.message }; }
}

async function logProctorEvent(payload) {
  try {
    const { error } = await window.db.from('placement_proctor_events').insert(payload);
    if (error) throw error;
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function getPlacementAnalytics() {
  try {
    const [students, tests, attempts, regs, selected] = await Promise.all([
      adminGetAllStudents(),
      getPlacementTests(),
      window.db.from('placement_test_attempts').select('*').then(r => r.data || []),
      window.db.from('placement_registrations').select('*').then(r => r.data || []),
      window.db.from('placement_student_status').select('*').eq('selection_status', 'selected').then(r => r.data || [])
    ]);
    const completed = attempts.filter(a => a.status === 'completed');
    const avg = completed.length
      ? Math.round(completed.reduce((s, a) => s + (a.score || 0), 0) / completed.length)
      : 0;
    const top = [...completed].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    return {
      totalEligible: students.length,
      totalRegistered: regs.length,
      totalAppeared: completed.length,
      totalSelected: selected.length,
      averageScore: avg,
      topPerformers: top,
      tests
    };
  } catch (e) { return null; }
}

async function getPlacementLeaderboard(limit = 50) {
  try {
    const { data, error } = await window.db
      .from('users')
      .select('id, first_name, last_name, branch, year, placement_score, placement_readiness, learning_level')
      .order('placement_score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

function computeReadinessCategory(score) {
  if (score >= 80) return 'Placement Ready';
  if (score >= 60) return 'Advanced';
  if (score >= 35) return 'Intermediate';
  return 'Beginner';
}

async function computePlacementReadiness(userId) {
  try {
    const profile = await getUserProfile(userId);
    const coding = Math.min(40, Math.round((profile?.problems_solved || 0) * 2));
    const xpPart = Math.min(20, Math.round((profile?.xp || 0) / 250));
    const streakPart = Math.min(10, (profile?.streak || 0));
    const { data: attempts } = await window.db.from('placement_test_attempts').select('score, max_score').eq('user_id', userId).eq('status', 'completed');
    const testPart = attempts?.length
      ? Math.min(30, Math.round(attempts.reduce((s, a) => s + ((a.score || 0) / Math.max(a.max_score || 1, 1)) * 30, 0) / attempts.length))
      : 0;
    const score = Math.min(100, coding + xpPart + streakPart + testPart);
    const category = computeReadinessCategory(score);
    await window.db.from('users').update({ placement_readiness: score }).eq('id', userId);
    return { score, category, breakdown: { coding, xpPart, streakPart, testPart } };
  } catch (e) { return { score: 0, category: 'Beginner' }; }
}