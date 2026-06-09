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
      .select('id, first_name, last_name, email, college, branch, year, xp, streak, problems_solved, rank_title, experience_level')
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
    const profile = await getUserProfile(userId);
    if (!profile) throw new Error('User not found');

    const newXP = (profile.xp || 0) + amount;
    const rankTitle = getRankTitle(newXP);

    const { error } = await window.db
      .from('users')
      .update({ xp: newXP, rank_title: rankTitle })
      .eq('id', userId);

    if (error) throw error;
    return { newXP, rankTitle };
  } catch (e) {
    console.error('giveXP:', e);
    return null;
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

const XP_BASE_ACCEPTED = 50;
const XP_FIRST_SOLVER = 100;
const XP_TOP5_BONUS = 25;
const XP_WRONG = 3;
const XP_ANSWER_ONLY = 1;

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

function calculateSubmissionXP(verdict, position, submissionMode) {
  if (verdict === 'Answer Only') return XP_ANSWER_ONLY;
  if (verdict !== 'Accepted') return XP_WRONG;

  let xp = XP_BASE_ACCEPTED;
  const isCode = submissionMode === 'code';

  if (isCode) {
    if (position === 1) xp += XP_FIRST_SOLVER;
    else if (position >= 2 && position <= 5) xp += XP_TOP5_BONUS;
  }

  return xp;
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

    if (isAccepted) {
      position = await getAcceptedSolvePosition(problemId);
      xpGained = calculateSubmissionXP(verdict, position, submissionMode);

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

        const problem = await getProblemById(problemId);
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

    let insertError = null;
    const { error } = await window.db.from('submissions').insert(row);
    if (error) {
      insertError = error;
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

    return {
      xpGained,
      position,
      streakBonus,
      isWrong: !isAccepted,
      verdict,
      passedCases,
      totalCases,
      runtimeMs,
      alreadySolved
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
  const u = await getCurrentUser();
  if (!u) {
    window.location.href = 'login.html';
    return null;
  }
  return u;
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
  return { h, m, s, formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
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

// ─── CODE EXECUTION (Judge0 CE — Piston public API is whitelist-only since Feb 2026) ─

const JUDGE0_URL = 'https://ce.judge0.com/submissions?base64_encoded=false&wait=true';
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const LANG_CONFIG = {
  python: { language_id: 71, label: 'Python 3', piston: { language: 'python', version: '3.10.0', filename: 'main.py' } },
  java: { language_id: 62, label: 'Java', piston: { language: 'java', version: '15.0.2', filename: 'Main.java' } },
  cpp: { language_id: 54, label: 'C++', piston: { language: 'c++', version: '10.2.0', filename: 'main.cpp' } },
  javascript: { language_id: 63, label: 'JavaScript', piston: { language: 'javascript', version: '18.15.0', filename: 'main.js' } }
};

async function executeViaPiston(langKey, code, stdin) {
  const cfg = LANG_CONFIG[langKey];
  if (!cfg?.piston) throw new Error('Unsupported language');
  const res = await fetch(PISTON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: cfg.piston.language,
      version: cfg.piston.version,
      files: [{ name: cfg.piston.filename, content: code }],
      stdin: stdin || ''
    })
  });
  const data = await res.json();
  const run = data.run || {};
  return {
    stdout: run.stdout || '',
    stderr: run.stderr || '',
    code: run.code,
    runtimeMs: 0,
    memoryKb: 0
  };
}

function normalizeOutput(s) {
  return (s || '').trim().replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

function formatExecutionOutput(result) {
  const stdout = (result.stdout || '').replace(/\r\n/g, '\n').trimEnd();
  const stderr = (result.stderr || '').replace(/\r\n/g, '\n').trimEnd();
  if (stdout) return stdout;
  if (stderr) return stderr;
  return '(no output)';
}

async function executeCode(langKey, code, stdin = '', timeoutMs = 10000) {
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

  console.log('[VidX Execute] request:', { lang: langKey, language_id: cfg.language_id, stdinLen: (stdin || '').length, cpuLimit });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5000);

  try {
    const res = await fetch(JUDGE0_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    clearTimeout(timer);

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.error('[VidX Execute] non-JSON response:', raw);
      throw new Error('Execution service returned invalid response');
    }

    console.log('[VidX Execute] response:', data);

    if (!res.ok) {
      throw new Error(data.message || data.error || `Execution HTTP ${res.status}`);
    }

    const statusId = data.status?.id;
    const stdout = data.stdout ?? '';
    const stderr = data.stderr ?? data.compile_output ?? '';
    const runtimeMs = Math.round(parseFloat(data.time || 0) * 1000);
    const memoryKb = data.memory || 0;

    if (statusId === 5) {
      return { stdout, stderr, error: 'Time Limit Exceeded', tle: true, code: 1, runtimeMs, memoryKb };
    }
    if (statusId === 6) {
      return { stdout, stderr: stderr || 'Compilation Error', code: 1, runtimeMs, memoryKb };
    }
    if (statusId === 11 || statusId === 12) {
      return { stdout, stderr: stderr || data.status?.description || 'Runtime Error', code: 1, runtimeMs, memoryKb };
    }

    const exitCode = statusId === 3 || statusId === 4 ? 0 : (statusId > 3 ? 1 : 0);
    return { stdout, stderr, code: exitCode, runtimeMs, memoryKb, status: data.status?.description };
  } catch (e) {
    clearTimeout(timer);
    console.warn('[VidX Execute] Judge0 failed, trying Piston fallback:', e);
    if (e.name === 'AbortError') return { error: 'Time Limit Exceeded', tle: true, stdout: '', stderr: '' };
    try {
      return await executeViaPiston(langKey, code, stdin);
    } catch (pistonErr) {
      console.error('[VidX Execute] Piston fallback failed:', pistonErr);
      throw e;
    }
  }
}

/** @deprecated Use executeCode — kept for backward compatibility */
async function executePistonCode(langKey, code, stdin = '', timeoutMs = 10000) {
  return executeCode(langKey, code, stdin, timeoutMs);
}

async function judgeSubmission(langKey, code, testCases, timeoutMs = 8000, onProgress) {
  const cases = Array.isArray(testCases) && testCases.length ? testCases : [];
  const total = cases.length || 1;
  console.log('[VidX Judge] cases:', cases.length, 'lang:', langKey);

  if (!cases.length) {
    return { verdict: 'Wrong Answer', passed: 0, total: 0, failedCase: { error: 'No test cases configured for this problem.' }, runtimeMs: 0 };
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
      const expected = normalizeOutput(tc.expected || tc.output || '');
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
