import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const getUserId = () => {
  let uid = localStorage.getItem('lifelog_uid');
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem('lifelog_uid', uid);
  }
  return uid;
};
