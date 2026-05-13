import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase, getUserId } from "./supabase";

/* ── date utils ── */
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const hm = (mins) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
const toMins = (s) => { const p = (s || "0:0").split(":"); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); };
const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtM = (ym) => new Date(ym + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dimDays = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };

/* ── Czech grades ── */
const CZ_GRADES = ["1", "1-", "2", "2-", "3", "3-", "4", "4-", "5"];
const gradeNum = (g) => { const b = parseInt(g); if (isNaN(b)) return 3; if (g.endsWith("-")) return b + 0.33; return b; };

/* ── palette ── */
const C = { bg: "#0c0b12", card: "#13121a", card2: "#0f0e16", border: "#1e1c2e", text: "#cccae0", muted: "#5a5870", accent: "#5b8dd9", good: "#6bbf6b", bad: "#c96b6b", blue2: "#3a6ab5", teal: "#5bb8b8" };
const COLS = ["#5b8dd9","#6bbf6b","#c96b6b","#8b6bd9","#5bb8b8","#d9915b","#b85bb8","#5bd9a8"];
const pc = (i) => COLS[i % COLS.length];
const gc = (n) => n <= 1.5 ? C.good : n <= 2.5 ? C.accent : n <= 3.5 ? "#7bafd9" : n <= 4 ? "#c9a06b" : C.bad;

/* ── habit scheduling ── */
const scheduled = (h, ds) => {
  const f = h.freq || { type: "daily" };
  if (f.type === "daily") return true;
  const d = new Date(ds + "T12:00:00");
  if (f.type === "every_x_days") { const diff = Math.round((d - new Date("2024-01-01T12:00:00")) / 86400000); return diff % (f.x || 2) === 0; }
  if (f.type === "weekly") return (f.days || []).includes((d.getDay() + 6) % 7);
  if (f.type === "monthly") return d.getDate() === (f.day || 1);
  return true;
};

const TABS = ["Habits","Sleep","Finance","Goals","School","Mood","Tasks","Business","Report"];
const MOODS = [{ v:1,e:"😔",l:"Rough"},{v:2,e:"😕",l:"Meh"},{v:3,e:"😐",l:"Okay"},{v:4,e:"🙂",l:"Good"},{v:5,e:"😄",l:"Great"}];
const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TCATS = ["school","finance","work","personal","health","other"];
const TPRIO = { low:[C.muted,"Low"], medium:[C.accent,"Medium"], high:[C.bad,"High"] };
const OSTATUS = { pending:[C.accent,"Pending"], in_progress:[C.teal,"In progress"], done:[C.good,"Done"], cancelled:[C.bad,"Cancelled"] };

/* ── tiny components ── */
const Bar = ({pct,color}) => (<div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(pct||0,100)}%`,background:color,borderRadius:3,transition:"width .3s"}}/></div>);
const Stat = ({label,value,color}) => (<div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 10px",textAlign:"center",flex:1,minWidth:72}}><div style={{fontSize:".57rem",color:C.muted,letterSpacing:".08em",textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontSize:"1.1rem",color:color||C.text,fontFamily:"'Lora',serif"}}>{value}</div></div>);
const Chip = ({children,color,bg}) => (<span style={{display:"inline-block",padding:"2px 7px",borderRadius:4,fontSize:".63rem",fontFamily:"'IBM Plex Mono',monospace",background:bg||C.border,color:color||C.muted}}>{children}</span>);
const T = ({children}) => <div style={{fontFamily:"'Lora',serif",fontSize:".93rem",fontWeight:500,color:C.text,marginBottom:12}}>{children}</div>;
const L = ({children}) => <span style={{fontSize:".62rem",color:C.muted,letterSpacing:".09em",textTransform:"uppercase",display:"block",margin:"10px 0 4px",fontFamily:"'IBM Plex Mono',monospace"}}>{children}</span>;
const Hr = () => <div style={{height:1,background:C.border,margin:"14px 0"}}/>;

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:${C.bg};}
  ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border};}
  .tab{background:none;border:none;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.1em;padding:10px 12px;color:${C.muted};border-bottom:1.5px solid transparent;transition:all .2s;white-space:nowrap;text-transform:uppercase;}
  .tab.on{color:${C.accent};border-bottom-color:${C.accent};}
  .tab:hover:not(.on){color:${C.text};}
  .card{background:${C.card};border:1px solid ${C.border};border-radius:10px;padding:16px;margin-bottom:12px;}
  .btn{border:none;border-radius:6px;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.04em;padding:7px 14px;transition:all .15s;}
  .bta{background:${C.accent};color:#fff;font-weight:500;}.bta:hover{background:${C.blue2};}
  .btg{background:${C.card};color:${C.muted};border:1px solid ${C.border};}.btg:hover{color:${C.text};border-color:${C.accent}55;}
  .btx{background:transparent;color:${C.bad};border:1px solid ${C.bad}33;padding:3px 8px;font-size:.65rem;border-radius:4px;cursor:pointer;font-family:'IBM Plex Mono',monospace;}.btx:hover{background:${C.bad}18;}
  .btsm{padding:5px 10px;font-size:.67rem;}
  .inp{background:${C.card2};border:1px solid ${C.border};border-radius:6px;color:${C.text};font-family:'IBM Plex Mono',monospace;font-size:.78rem;padding:7px 10px;outline:none;width:100%;transition:border .2s;}.inp:focus{border-color:${C.accent}66;}
  .sel{background:${C.card2};border:1px solid ${C.border};border-radius:6px;color:${C.text};font-family:'IBM Plex Mono',monospace;font-size:.78rem;padding:7px 10px;outline:none;}
  .row{display:flex;gap:9px;flex-wrap:wrap;}
  .ov{position:fixed;inset:0;background:#00000090;display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(3px);}
  .modal{background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:22px;width:360px;max-width:96vw;max-height:90vh;overflow-y:auto;}
  .hrow{display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:8px;border:1px solid ${C.border};margin-bottom:7px;cursor:pointer;transition:background .15s;}
  .hrow:hover{background:#1a1925;}.hrow.done{border-color:${C.accent}44;background:${C.accent}0a;}
  .dot{width:11px;height:11px;border-radius:2px;flex-shrink:0;}
  .moodbtn{background:none;border:1.5px solid ${C.border};border-radius:8px;cursor:pointer;padding:8px 10px;font-size:1.4rem;transition:all .2s;line-height:1;}.moodbtn.on{border-color:${C.accent};background:${C.accent}18;}
  .trow{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-bottom:1px solid ${C.border};}
  .orow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid ${C.border};}
  .frow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid ${C.border};}
  .sc{border:1px solid ${C.border};border-radius:8px;padding:12px;margin-bottom:9px;background:${C.card2};}
  .hint{font-size:.59rem;color:${C.muted};margin-top:3px;}
  .sync{font-size:.6rem;color:${C.muted};display:flex;align-items:center;gap:4px;}
  .sync.ok{color:${C.good};} .sync.err{color:${C.bad};}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spinner{animation:spin 1s linear infinite;display:inline-block;}
`;

export default function App() {
  const uid = getUserId();
  const [tab, setTab] = useState("Habits");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("ok"); // ok | syncing | error

  /* ── all data state ── */
  const [habits, setHabits] = useState([]);
  const [hlog, setHlog] = useState({});
  const [sleep, setSleep] = useState([]);
  const [fin, setFin] = useState([]);
  const [recur, setRecur] = useState([]);
  const [fgoals, setFgoals] = useState([]);
  const [goals, setGoals] = useState([]);
  const [subs, setSubs] = useState([]);
  const [study, setStudy] = useState([]);
  const [grades, setGrades] = useState([]);
  const [mood, setMood] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [biz, setBiz] = useState([]);

  /* ── load all data from Supabase on mount ── */
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("lifelog_data")
          .select("key, value")
          .eq("user_id", uid);
        if (data) {
          const map = {};
          data.forEach(r => { map[r.key] = r.value; });
          if (map.habits) setHabits(map.habits);
          if (map.hlog) setHlog(map.hlog);
          if (map.sleep) setSleep(map.sleep);
          if (map.fin) setFin(map.fin);
          if (map.recur) setRecur(map.recur);
          if (map.fgoals) setFgoals(map.fgoals);
          if (map.goals) setGoals(map.goals);
          if (map.subs) setSubs(map.subs);
          if (map.study) setStudy(map.study);
          if (map.grades) setGrades(map.grades);
          if (map.mood) setMood(map.mood);
          if (map.tasks) setTasks(map.tasks);
          if (map.orders) setOrders(map.orders);
          if (map.clients) setClients(map.clients);
          if (map.biz) setBiz(map.biz);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    loadAll();
  }, [uid]);

  /* ── sync helper ── */
  const syncRef = useRef({});
  const sync = useCallback(async (key, value) => {
    setSyncStatus("syncing");
    // debounce per key
    clearTimeout(syncRef.current[key]);
    syncRef.current[key] = setTimeout(async () => {
      try {
        await supabase.from("lifelog_data").upsert(
          { user_id: uid, key, value, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
        setSyncStatus("ok");
      } catch (e) { setSyncStatus("error"); }
    }, 800);
  }, [uid]);

  /* ── sync on every change ── */
  useEffect(() => { if (!loading) sync("habits", habits); }, [habits, loading]);
  useEffect(() => { if (!loading) sync("hlog", hlog); }, [hlog, loading]);
  useEffect(() => { if (!loading) sync("sleep", sleep); }, [sleep, loading]);
  useEffect(() => { if (!loading) sync("fin", fin); }, [fin, loading]);
  useEffect(() => { if (!loading) sync("recur", recur); }, [recur, loading]);
  useEffect(() => { if (!loading) sync("fgoals", fgoals); }, [fgoals, loading]);
  useEffect(() => { if (!loading) sync("goals", goals); }, [goals, loading]);
  useEffect(() => { if (!loading) sync("subs", subs); }, [subs, loading]);
  useEffect(() => { if (!loading) sync("study", study); }, [study, loading]);
  useEffect(() => { if (!loading) sync("grades", grades); }, [grades, loading]);
  useEffect(() => { if (!loading) sync("mood", mood); }, [mood, loading]);
  useEffect(() => { if (!loading) sync("tasks", tasks); }, [tasks, loading]);
  useEffect(() => { if (!loading) sync("orders", orders); }, [orders, loading]);
  useEffect(() => { if (!loading) sync("clients", clients); }, [clients, loading]);
  useEffect(() => { if (!loading) sync("biz", biz); }, [biz, loading]);

  /* modals */
  const [mHabit, setMHabit] = useState(false);
  const [mGoal, setMGoal] = useState(false);
  const [mSub, setMSub] = useState(false);
  const [mFgoal, setMFgoal] = useState(false);
  const [mRecur, setMRecur] = useState(false);
  const [mTask, setMTask] = useState(false);
  const [mOrder, setMOrder] = useState(false);
  const [mClient, setMClient] = useState(false);
  const [mCount, setMCount] = useState(null);
  const [countV, setCountV] = useState("");

  /* forms */
  const [fHabit, setFHabit] = useState({name:"",icon:"✅",type:"check",unit:"",target:"",freq:{type:"daily",x:2,days:[],day:1}});
  const [fSleep, setFSleep] = useState({date:today(),time:"07:30",quality:4});
  const [fFin, setFFin] = useState({date:today(),type:"expense",category:"",amount:"",note:""});
  const [fFgoal, setFFgoal] = useState({name:"",target:"",saved:""});
  const [fRecur, setFRecur] = useState({name:"",type:"expense",amount:"",day:1,note:""});
  const [fGoal, setFGoal] = useState({title:"",type:"numeric",target:"",unit:"",current:""});
  const [fSub, setFSub] = useState({name:"",color:"#5b8dd9"});
  const [fStudy, setFStudy] = useState({subId:"",date:today(),dur:"01:00",note:""});
  const [fGrade, setFGrade] = useState({subId:"",date:today(),label:"",grade:"1",weight:5});
  const [fMood, setFMood] = useState({date:today(),value:3,note:""});
  const [fTask, setFTask] = useState({title:"",due:"",category:"school",priority:"medium",note:""});
  const [fOrder, setFOrder] = useState({clientId:"",desc:"",amount:"",date:today(),status:"pending"});
  const [fClient, setFClient] = useState({name:"",contact:"",note:""});
  const [fBiz, setFBiz] = useState({date:today(),type:"revenue",category:"",amount:"",note:""});
  const [repMonth, setRepMonth] = useState(thisMonth());

  /* recurring injected */
  const recurThisMonth = useMemo(() =>
    recur.map(r=>({...r,id:`rec_${r.id}_${thisMonth()}`,date:`${thisMonth()}-${String(r.day).padStart(2,"0")}`,isRec:true})),
  [recur]);
  const allFin = useMemo(()=>[...fin,...recurThisMonth].sort((a,b)=>b.date.localeCompare(a.date)),[fin,recurThisMonth]);

  /* habit helpers */
  const hval = (hid,ds) => hlog[`${ds}_${hid}`]||0;
  const isDone = (h,ds) => { const v=hval(h.id,ds); return h.type==="check"?v>0:(h.target>0?v>=h.target:v>0); };
  const getStreak = (hid) => {
    let s=0; const d=new Date(); const h=habits.find(x=>x.id===hid); if(!h) return 0;
    for(let i=0;i<365;i++){const ds=d.toISOString().slice(0,10);if(!scheduled(h,ds)){d.setDate(d.getDate()-1);continue;}if(hlog[`${ds}_${hid}`]){s++;d.setDate(d.getDate()-1);}else break;}
    return s;
  };
  const last7 = Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10);});

  const toggleHabit = (hid) => {
    const h=habits.find(x=>x.id===hid);
    if(h.type==="count"){setMCount(hid);setCountV("");return;}
    const k=`${today()}_${hid}`;
    setHlog(p=>({...p,[k]:p[k]?0:1}));
  };
  const logCount = () => { setHlog(p=>({...p,[`${today()}_${mCount}`]:parseFloat(countV)||0})); setMCount(null); };
  const addHabit = () => {
    if(!fHabit.name.trim())return;
    setHabits(p=>[...p,{...fHabit,id:Date.now(),color:pc(p.length),target:parseFloat(fHabit.target)||0}]);
    setFHabit({name:"",icon:"✅",type:"check",unit:"",target:"",freq:{type:"daily",x:2,days:[],day:1}});
    setMHabit(false);
  };

  /* sleep */
  const sleepAvg = sleep.slice(0,7).length?Math.round(sleep.slice(0,7).reduce((s,x)=>s+x.minutes,0)/Math.min(sleep.length,7)):0;
  const logSleep = () => {
    if(!fSleep.time)return;
    setSleep(p=>[...p.filter(s=>s.date!==fSleep.date),{...fSleep,minutes:toMins(fSleep.time)}].sort((a,b)=>b.date.localeCompare(a.date)));
  };

  /* finance */
  const mFin=allFin.filter(f=>f.date.startsWith(thisMonth()));
  const mInc=mFin.filter(f=>f.type==="income").reduce((s,f)=>s+f.amount,0);
  const mExp=mFin.filter(f=>f.type==="expense").reduce((s,f)=>s+f.amount,0);
  const mBal=mInc-mExp;
  const addFin = () => {
    if(!fFin.amount||!fFin.category)return;
    setFin(p=>[{...fFin,id:Date.now(),amount:parseFloat(fFin.amount)},...p]);
    setFFin(p=>({...p,category:"",amount:"",note:""}));
  };
  const addRecur = () => {
    if(!fRecur.name||!fRecur.amount)return;
    setRecur(p=>[...p,{...fRecur,id:Date.now(),amount:parseFloat(fRecur.amount)}]);
    setFRecur({name:"",type:"expense",amount:"",day:1,note:""}); setMRecur(false);
  };
  const addFgoal = () => {
    if(!fFgoal.name||!fFgoal.target)return;
    setFgoals(p=>[...p,{...fFgoal,id:Date.now(),target:parseFloat(fFgoal.target),saved:parseFloat(fFgoal.saved)||0}]);
    setFFgoal({name:"",target:"",saved:""}); setMFgoal(false);
  };

  /* goals */
  const addGoal = () => {
    if(!fGoal.title)return;
    setGoals(p=>[...p,{...fGoal,id:Date.now(),target:parseFloat(fGoal.target)||1,current:parseFloat(fGoal.current)||0,done:false}]);
    setFGoal({title:"",type:"numeric",target:"",unit:"",current:""}); setMGoal(false);
  };

  /* school */
  const addSub = () => {
    if(!fSub.name.trim())return;
    setSubs(p=>[...p,{...fSub,id:Date.now()}]);
    setFSub({name:"",color:pc(subs.length)}); setMSub(false);
  };
  const logStudy = () => {
    if(!fStudy.subId||!fStudy.dur)return;
    setStudy(p=>[...p,{...fStudy,id:Date.now(),minutes:toMins(fStudy.dur)}]);
    setFStudy(p=>({...p,dur:"01:00",note:""}));
  };
  const logGrade = () => {
    if(!fGrade.subId||!fGrade.label||!fGrade.grade)return;
    setGrades(p=>[...p,{...fGrade,id:Date.now(),gnum:gradeNum(fGrade.grade),weight:parseInt(fGrade.weight)||5}]);
    setFGrade(p=>({...p,label:"",grade:"1",weight:5}));
  };
  const subStats = (sid) => {
    const ls=study.filter(s=>s.subId==sid);
    const gs=grades.filter(g=>g.subId==sid);
    const totalMins=ls.reduce((s,l)=>s+l.minutes,0);
    const wavg=gs.length?gs.reduce((s,g)=>s+g.gnum*g.weight,0)/gs.reduce((s,g)=>s+g.weight,0):null;
    return {totalMins,wavg};
  };

  /* mood */
  const avgMood=mood.slice(0,7).length?(mood.slice(0,7).reduce((s,m)=>s+m.value,0)/Math.min(mood.length,7)).toFixed(1):"—";
  const logMood = () => {
    setMood(p=>[...p.filter(m=>m.date!==fMood.date),{...fMood}].sort((a,b)=>b.date.localeCompare(a.date)));
    setFMood(p=>({...p,note:""}));
  };

  /* tasks */
  const overdue=tasks.filter(t=>!t.done&&t.due&&t.due<today()).length;
  const addTask = () => {
    if(!fTask.title)return;
    setTasks(p=>[...p,{...fTask,id:Date.now(),done:false}]);
    setFTask({title:"",due:"",category:"school",priority:"medium",note:""}); setMTask(false);
  };

  /* business */
  const mBiz=biz.filter(e=>e.date.startsWith(thisMonth()));
  const mRev=mBiz.filter(e=>e.type==="revenue").reduce((s,e)=>s+e.amount,0);
  const mBizExp=mBiz.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const mProfit=mRev-mBizExp;
  const pendingVal=orders.filter(o=>o.status==="pending").reduce((s,o)=>s+o.amount,0);
  const addOrder = () => {
    if(!fOrder.desc||!fOrder.amount)return;
    setOrders(p=>[{...fOrder,id:Date.now(),amount:parseFloat(fOrder.amount)},...p]);
    setFOrder({clientId:"",desc:"",amount:"",date:today(),status:"pending"}); setMOrder(false);
  };
  const addClient = () => {
    if(!fClient.name)return;
    setClients(p=>[...p,{...fClient,id:Date.now()}]);
    setFClient({name:"",contact:"",note:""}); setMClient(false);
  };
  const addBiz = () => {
    if(!fBiz.amount||!fBiz.category)return;
    setBiz(p=>[{...fBiz,id:Date.now(),amount:parseFloat(fBiz.amount)},...p]);
    setFBiz(p=>({...p,category:"",amount:"",note:""}));
  };

  /* report */
  const rep = useMemo(()=>{
    const rf=[...fin,...recur.map(r=>({...r,date:`${repMonth}-${String(r.day).padStart(2,"0")}`}))].filter(f=>f.date.startsWith(repMonth));
    const rInc=rf.filter(f=>f.type==="income").reduce((s,f)=>s+f.amount,0);
    const rExp=rf.filter(f=>f.type==="expense").reduce((s,f)=>s+f.amount,0);
    const rm=mood.filter(m=>m.date.startsWith(repMonth));
    const avgM=rm.length?(rm.reduce((s,m)=>s+m.value,0)/rm.length).toFixed(1):"—";
    const rs=sleep.filter(s=>s.date.startsWith(repMonth));
    const avgS=rs.length?hm(Math.round(rs.reduce((s,x)=>s+x.minutes,0)/rs.length)):"—";
    const dc=dimDays(repMonth);
    const hStats=habits.map(h=>{
      let days=0;
      for(let i=1;i<=dc;i++){const ds=`${repMonth}-${String(i).padStart(2,"0")}`;if(scheduled(h,ds)&&hlog[`${ds}_${h.id}`])days++;}
      const sch=Array.from({length:dc},(_,i)=>`${repMonth}-${String(i+1).padStart(2,"0")}`).filter(ds=>scheduled(h,ds)).length;
      return {...h,days,sch,pct:sch?Math.round((days/sch)*100):0};
    });
    const gStats=goals.map(g=>({...g,pct:g.type==="completable"?(g.done?100:0):Math.round((g.current/g.target)*100)}));
    const rb=biz.filter(e=>e.date.startsWith(repMonth));
    const rRev=rb.filter(e=>e.type==="revenue").reduce((s,e)=>s+e.amount,0);
    const rBExp=rb.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
    return {rInc,rExp,rBal:rInc-rExp,avgM,avgS,hStats,gStats,rRev,rBExp,rProfit:rRev-rBExp};
  },[repMonth,fin,recur,mood,sleep,habits,hlog,goals,biz]);

  const freqLbl = (freq) => {
    if(!freq||freq.type==="daily")return"Daily";
    if(freq.type==="every_x_days")return`Every ${freq.x||2} days`;
    if(freq.type==="weekly")return`Weekly (${(freq.days||[]).map(i=>WDAYS[i]).join(", ")})`;
    if(freq.type==="monthly")return`Monthly (day ${freq.day||1})`;
    return"";
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",flexDirection:"column",gap:12}}>
      <div style={{fontSize:"1.4rem",fontFamily:"'Lora',serif",color:C.accent}}>LifeLog</div>
      <div style={{fontSize:".75rem"}}>Loading your data…</div>
    </div>
  );

  return (
    <div style={{fontFamily:"'IBM Plex Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text}}>
      <style>{css}</style>

      {/* Header */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontFamily:"'Lora',serif",fontSize:"1.3rem",fontWeight:600,color:C.accent}}>LifeLog</div>
          <div style={{fontSize:".59rem",color:C.muted,marginTop:1}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          {[{l:"Mood",v:avgMood,c:C.accent},{l:"Balance",v:`${mBal>=0?"+":""}${Math.abs(mBal).toFixed(0)} Kč`,c:mBal>=0?C.good:C.bad},{l:"Sleep",v:sleep[0]?hm(sleep[0].minutes):"—",c:C.accent},{l:"Deadlines",v:overdue>0?`⚠ ${overdue}`:tasks.filter(t=>!t.done).length,c:overdue>0?C.bad:C.muted}].map(s=>(
            <div key={s.l} style={{textAlign:"center"}}>
              <div style={{fontSize:".54rem",color:C.muted,textTransform:"uppercase",letterSpacing:".07em"}}>{s.l}</div>
              <div style={{fontSize:".98rem",color:s.c,fontFamily:"'Lora',serif",marginTop:1}}>{s.v}</div>
            </div>
          ))}
          <div className={`sync${syncStatus==="ok"?" ok":syncStatus==="error"?" err":""}`}>
            {syncStatus==="syncing"&&<span className="spinner">↻</span>}
            {syncStatus==="ok"&&"✓ synced"}
            {syncStatus==="error"&&"⚠ sync error"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.card,overflowX:"auto"}}>
        {TABS.map(t=><button key={t} className={`tab${tab===t?" on":""}`} onClick={()=>setTab(t)}>{t}</button>)}
      </div>

      <div style={{padding:"16px 14px 60px",maxWidth:"700px",margin:"0 auto"}}>

        {/* ══ HABITS ══ */}
        {tab==="Habits"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <T>Today's Habits</T>
            <button className="btn bta" onClick={()=>setMHabit(true)}>+ Add</button>
          </div>
          {habits.map(h=>{
            const sched=scheduled(h,today());
            const done=isDone(h,today());
            const v=hval(h.id,today());
            const str=getStreak(h.id);
            return(
              <div key={h.id} className={`hrow${done?" done":""}`} style={{opacity:sched?1:.4}} onClick={()=>sched&&toggleHabit(h.id)}>
                <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${done?h.color:C.border}`,background:done?h.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".58rem",color:"#fff",flexShrink:0,transition:"all .2s"}}>{done?"✓":""}</div>
                <div style={{fontSize:"1rem"}}>{h.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:".83rem",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {h.name}
                    {!sched&&<Chip>not today</Chip>}
                    {h.type==="count"&&v>0&&<Chip color={h.color} bg={h.color+"22"}>{v} {h.unit}</Chip>}
                  </div>
                  <div style={{display:"flex",gap:2,marginTop:4}}>
                    {last7.map(ds=>{const ok=isDone(h,ds);const sc=scheduled(h,ds);return<div key={ds} className="dot" style={{background:!sc?C.border+"44":ok?h.color:C.border}} title={fmt(ds)}/>;})}</div>
                  <div style={{fontSize:".57rem",color:C.muted,marginTop:2}}>{freqLbl(h.freq)}</div>
                </div>
                {h.target>0&&h.type==="count"&&<div style={{fontSize:".63rem",color:C.muted,textAlign:"center",minWidth:34}}><div>{v}/{h.target}</div><div style={{fontSize:".54rem"}}>{h.unit}</div></div>}
                <div style={{textAlign:"center",minWidth:30}}><div style={{fontSize:".54rem",color:C.muted}}>streak</div><div style={{color:h.color,fontSize:".78rem"}}>{str}d</div></div>
                <button className="btx" onClick={e=>{e.stopPropagation();setHabits(p=>p.filter(x=>x.id!==h.id));}}>✕</button>
              </div>
            );
          })}
          {habits.length===0&&<div style={{color:C.muted,textAlign:"center",marginTop:40}}>No habits yet.</div>}
        </>}

        {/* ══ SLEEP ══ */}
        {tab==="Sleep"&&<>
          <div className="card">
            <T>Log Sleep</T>
            <div className="row">
              <div style={{flex:1}}><L>Date</L><input type="date" className="inp" value={fSleep.date} onChange={e=>setFSleep(p=>({...p,date:e.target.value}))}/></div>
              <div style={{flex:1}}><L>Duration (h:mm)</L><input type="text" className="inp" placeholder="7:30" value={fSleep.time} onChange={e=>setFSleep(p=>({...p,time:e.target.value.replace(/[^0-9:]/g,"")})}/><div className="hint">8:05 = 8 hrs 5 min</div></div>
              <div style={{flex:1}}><L>Quality</L><select className="sel" style={{width:"100%"}} value={fSleep.quality} onChange={e=>setFSleep(p=>({...p,quality:+e.target.value}))}>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} — {["Terrible","Poor","Okay","Good","Perfect"][v-1]}</option>)}</select></div>
            </div>
            <button className="btn bta" style={{marginTop:12}} onClick={logSleep}>Log</button>
          </div>
          {sleep.length>0&&<>
            <div className="row" style={{marginBottom:11}}>
              {[{l:"Avg 7d",v:hm(sleepAvg)},{l:"Last night",v:hm(sleep[0]?.minutes||0)},{l:"Avg quality",v:(sleep.slice(0,7).reduce((s,x)=>s+x.quality,0)/Math.min(sleep.length,7)).toFixed(1)+"/5"}].map(s=><Stat key={s.l} label={s.l} value={s.v} color={C.accent}/>)}
            </div>
            <div className="card" style={{padding:"9px 12px"}}>
              {sleep.slice(0,14).map(s=>(
                <div key={s.date} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:65,fontSize:".7rem",color:C.muted}}>{fmt(s.date)}</div>
                  <div style={{flex:1}}><Bar pct={(s.minutes/600)*100} color={s.minutes>=420?C.accent:C.bad}/></div>
                  <div style={{width:36,textAlign:"right",color:s.minutes>=420?C.accent:C.bad,fontSize:".77rem"}}>{hm(s.minutes)}</div>
                  <div style={{fontSize:".64rem",color:C.muted}}>★{s.quality}</div>
                  <button className="btx" onClick={()=>setSleep(p=>p.filter(x=>x.date!==s.date))}>✕</button>
                </div>
              ))}
            </div>
          </>}
        </>}

        {/* ══ FINANCE ══ */}
        {tab==="Finance"&&<>
          <div className="row" style={{marginBottom:12}}>
            {[{l:"Income",v:`${mInc.toFixed(0)} Kč`,c:C.good},{l:"Expenses",v:`${mExp.toFixed(0)} Kč`,c:C.bad},{l:"Balance",v:`${mBal>=0?"+":""}${Math.abs(mBal).toFixed(0)} Kč`,c:mBal>=0?C.good:C.bad}].map(s=><Stat key={s.l} label={s.l} value={s.v} color={s.c}/>)}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:".68rem",color:C.muted,textTransform:"uppercase",letterSpacing:".07em"}}>Saving Goals</div>
            <button className="btn btg btsm" onClick={()=>setMFgoal(true)}>+ Goal</button>
          </div>
          {fgoals.map(g=>{const pct=Math.min((g.saved/g.target)*100,100);return(
            <div key={g.id} className="card" style={{padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:".84rem"}}>{g.name}</div>
                <div style={{display:"flex",gap:7,alignItems:"center"}}><span style={{fontSize:".74rem",color:C.accent}}>{g.saved.toFixed(0)} / {g.target.toFixed(0)} Kč</span><button className="btx" onClick={()=>setFgoals(p=>p.filter(x=>x.id!==g.id))}>✕</button></div>
              </div>
              <div style={{marginTop:8}}><Bar pct={pct} color={pct>=100?C.good:C.accent}/></div>
              <div style={{display:"flex",gap:7,marginTop:8,alignItems:"center"}}>
                <span style={{fontSize:".62rem",color:C.muted}}>Saved Kč</span>
                <input type="number" className="inp" style={{width:90}} value={g.saved} onChange={e=>setFgoals(p=>p.map(x=>x.id===g.id?{...x,saved:parseFloat(e.target.value)||0}:x))}/>
                <span style={{fontSize:".65rem",color:C.muted}}>{Math.round(pct)}%</span>
              </div>
            </div>
          );})}
          <Hr/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:".68rem",color:C.muted,textTransform:"uppercase",letterSpacing:".07em"}}>Recurring Payments</div>
            <button className="btn btg btsm" onClick={()=>setMRecur(true)}>+ Add</button>
          </div>
          {recur.length===0&&<div style={{fontSize:".73rem",color:C.muted,marginBottom:10}}>No recurring payments.</div>}
          {recur.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
              <Chip color={r.type==="income"?C.good:C.bad} bg={(r.type==="income"?C.good:C.bad)+"18"}>{r.type}</Chip>
              <div style={{flex:1}}><div style={{fontSize:".8rem"}}>{r.name}</div><div style={{fontSize:".62rem",color:C.muted}}>every month, day {r.day}</div></div>
              <span style={{color:r.type==="income"?C.good:C.bad,fontSize:".8rem"}}>{r.type==="income"?"+":"-"}{r.amount.toFixed(0)} Kč</span>
              <button className="btx" onClick={()=>setRecur(p=>p.filter(x=>x.id!==r.id))}>✕</button>
            </div>
          ))}
          <Hr/>
          <div className="card">
            <T>Add Entry</T>
            <div className="row">
              <div><L>Type</L><select className="sel" value={fFin.type} onChange={e=>setFFin(p=>({...p,type:e.target.value}))}><option value="income">Income</option><option value="expense">Expense</option></select></div>
              <div style={{flex:1}}><L>Category</L><input className="inp" placeholder={fFin.type==="income"?"Salary…":"Rent, Food…"} value={fFin.category} onChange={e=>setFFin(p=>({...p,category:e.target.value}))}/></div>
              <div style={{width:88}}><L>Amount Kč</L><input type="number" className="inp" placeholder="0" value={fFin.amount} onChange={e=>setFFin(p=>({...p,amount:e.target.value}))}/></div>
            </div>
            <div className="row" style={{marginTop:7}}>
              <div style={{flex:1}}><L>Note</L><input className="inp" placeholder="Optional" value={fFin.note} onChange={e=>setFFin(p=>({...p,note:e.target.value}))}/></div>
              <div><L>Date</L><input type="date" className="inp" value={fFin.date} onChange={e=>setFFin(p=>({...p,date:e.target.value}))}/></div>
            </div>
            <button className="btn bta" style={{marginTop:12}} onClick={addFin}>Add</button>
          </div>
          <div className="card" style={{padding:"8px 12px"}}>
            {allFin.length===0&&<div style={{color:C.muted,textAlign:"center"}}>No entries.</div>}
            {allFin.slice(0,30).map(f=>(
              <div key={f.id} className="frow">
                <Chip color={f.type==="income"?C.good:C.bad} bg={(f.type==="income"?C.good:C.bad)+"18"}>{f.type}</Chip>
                {f.isRec&&<Chip>🔄</Chip>}
                <div style={{flex:1}}><div style={{fontSize:".79rem"}}>{f.category||f.name}{f.note?<span style={{color:C.muted}}> — {f.note}</span>:""}</div><div style={{fontSize:".62rem",color:C.muted,marginTop:2}}>{fmt(f.date)}</div></div>
                <span style={{color:f.type==="income"?C.good:C.bad,fontSize:".8rem"}}>{f.type==="income"?"+":"-"}{f.amount.toFixed(0)} Kč</span>
                {!f.isRec&&<button className="btx" onClick={()=>setFin(p=>p.filter(x=>x.id!==f.id))}>✕</button>}
              </div>
            ))}
          </div>
        </>}

        {/* ══ GOALS ══ */}
        {tab==="Goals"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <T>Goals</T>
            <button className="btn bta" onClick={()=>setMGoal(true)}>+ Add</button>
          </div>
          {goals.length===0&&<div style={{color:C.muted,textAlign:"center",marginTop:40}}>No goals yet.</div>}
          {goals.map(g=>{
            if(g.type==="completable")return(
              <div key={g.id} className="card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontSize:".85rem",display:"flex",alignItems:"center",gap:7}}>{g.done&&<span style={{color:C.good}}>✓</span>}{g.title}</div><div style={{marginTop:4}}><Chip>Completable</Chip></div></div>
                  <div style={{display:"flex",gap:7}}>
                    <button className="btn" style={{background:g.done?C.good+"22":C.border,color:g.done?C.good:C.muted,fontSize:".68rem",padding:"5px 10px"}} onClick={()=>setGoals(p=>p.map(x=>x.id===g.id?{...x,done:!x.done}:x))}>{g.done?"✓ Done":"Mark done"}</button>
                    <button className="btx" onClick={()=>setGoals(p=>p.filter(x=>x.id!==g.id))}>✕</button>
                  </div>
                </div>
              </div>
            );
            const pct=Math.min((g.current/g.target)*100,100);
            return(
              <div key={g.id} className="card">
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div><div style={{fontSize:".85rem"}}>{g.title}</div><div style={{fontSize:".67rem",color:C.muted,marginTop:2}}>{g.current} / {g.target} {g.unit}</div></div>
                  <button className="btx" onClick={()=>setGoals(p=>p.filter(x=>x.id!==g.id))}>✕</button>
                </div>
                <div style={{marginTop:8}}><Bar pct={pct} color={pct>=100?C.good:C.accent}/></div>
                <div style={{display:"flex",gap:7,marginTop:8,alignItems:"center"}}>
                  <input type="number" className="inp" style={{width:82}} value={g.current} min={0} max={g.target} onChange={e=>setGoals(p=>p.map(x=>x.id===g.id?{...x,current:Math.min(parseFloat(e.target.value)||0,x.target)}:x))}/>
                  <span style={{fontSize:".68rem",color:C.muted}}>{g.unit} — {Math.round(pct)}%</span>
                </div>
              </div>
            );
          })}
        </>}

        {/* ══ SCHOOL ══ */}
        {tab==="School"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <T>School Tracker</T>
            <button className="btn bta" onClick={()=>setMSub(true)}>+ Subject</button>
          </div>
          {subs.map(sub=>{
            const st=subStats(sub.id);
            const sg=grades.filter(g=>g.subId==sub.id).sort((a,b)=>b.date.localeCompare(a.date));
            return(
              <div key={sub.id} className="sc">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:sub.color}}/>
                    <span style={{fontFamily:"'Lora',serif",fontSize:".9rem"}}>{sub.name}</span>
                  </div>
                  <div style={{display:"flex",gap:7,alignItems:"center"}}>
                    <span style={{fontSize:".67rem",color:C.muted}}>{hm(st.totalMins)} studied</span>
                    {st.wavg!==null&&<Chip color={gc(st.wavg)} bg={gc(st.wavg)+"22"}>{st.wavg.toFixed(2)}</Chip>}
                    <button className="btx" onClick={()=>{setSubs(p=>p.filter(s=>s.id!==sub.id));setStudy(p=>p.filter(s=>s.subId!=sub.id));setGrades(p=>p.filter(g=>g.subId!=sub.id));}}>✕</button>
                  </div>
                </div>
                {sg.slice(0,4).map(g=>(
                  <div key={g.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderTop:`1px solid ${C.border}`,fontSize:".7rem",alignItems:"center",gap:6}}>
                    <span style={{color:C.muted,flex:1}}>{g.label}</span>
                    <span style={{color:C.muted}}>{fmt(g.date)}</span>
                    <span style={{color:C.muted,fontSize:".6rem"}}>w:{g.weight}</span>
                    <Chip color={gc(g.gnum)} bg={gc(g.gnum)+"22"}>{g.grade}</Chip>
                    <button className="btx" style={{padding:"1px 5px"}} onClick={()=>setGrades(p=>p.filter(x=>x.id!==g.id))}>✕</button>
                  </div>
                ))}
              </div>
            );
          })}
          {subs.length===0&&<div style={{color:C.muted,textAlign:"center",marginTop:30}}>No subjects yet.</div>}
          <Hr/>
          <div className="card">
            <T>Log Study Session</T>
            <div className="row">
              <div style={{flex:1}}><L>Subject</L><select className="sel" style={{width:"100%"}} value={fStudy.subId} onChange={e=>setFStudy(p=>({...p,subId:e.target.value}))}><option value="">Select…</option>{subs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><L>Duration (h:mm)</L><input type="text" className="inp" style={{width:80}} placeholder="1:30" value={fStudy.dur} onChange={e=>setFStudy(p=>({...p,dur:e.target.value.replace(/[^0-9:]/g,"")})}/></div>
              <div><L>Date</L><input type="date" className="inp" value={fStudy.date} onChange={e=>setFStudy(p=>({...p,date:e.target.value}))}/></div>
            </div>
            <L>Note</L><input className="inp" placeholder="Topic covered…" value={fStudy.note} onChange={e=>setFStudy(p=>({...p,note:e.target.value}))}/>
            <button className="btn bta" style={{marginTop:11}} onClick={logStudy}>Log Session</button>
          </div>
          <div className="card">
            <T>Log Grade (Czech 1–5)</T>
            <div className="row">
              <div style={{flex:1}}><L>Subject</L><select className="sel" style={{width:"100%"}} value={fGrade.subId} onChange={e=>setFGrade(p=>({...p,subId:e.target.value}))}><option value="">Select…</option>{subs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div style={{flex:1}}><L>Assignment / Test</L><input className="inp" placeholder="Test, Assignment…" value={fGrade.label} onChange={e=>setFGrade(p=>({...p,label:e.target.value}))}/></div>
            </div>
            <div className="row" style={{marginTop:5}}>
              <div><L>Grade</L><select className="sel" value={fGrade.grade} onChange={e=>setFGrade(p=>({...p,grade:e.target.value}))}>{CZ_GRADES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
              <div><L>Weight (1–10)</L><input type="number" className="inp" style={{width:68}} min={1} max={10} value={fGrade.weight} onChange={e=>setFGrade(p=>({...p,weight:e.target.value}))}/></div>
              <div><L>Date</L><input type="date" className="inp" value={fGrade.date} onChange={e=>setFGrade(p=>({...p,date:e.target.value}))}/></div>
            </div>
            <div className="hint" style={{marginTop:4}}>1 = best grade · Weighted mean</div>
            <button className="btn bta" style={{marginTop:11}} onClick={logGrade}>Log Grade</button>
          </div>
        </>}

        {/* ══ MOOD ══ */}
        {tab==="Mood"&&<>
          <div className="card">
            <T>Mood</T>
            <L>Date</L><input type="date" className="inp" value={fMood.date} onChange={e=>setFMood(p=>({...p,date:e.target.value}))}/>
            <L>How are you feeling?</L>
            <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
              {MOODS.map(m=><button key={m.v} className={`moodbtn${fMood.value===m.v?" on":""}`} onClick={()=>setFMood(p=>({...p,value:m.v}))}>{m.e}<div style={{fontSize:".54rem",color:C.muted,marginTop:3}}>{m.l}</div></button>)}
            </div>
            <L>Note (optional)</L><input className="inp" placeholder="What's on your mind…" value={fMood.note} onChange={e=>setFMood(p=>({...p,note:e.target.value}))}/>
            <button className="btn bta" style={{marginTop:12}} onClick={logMood}>Log</button>
          </div>
          {mood.length>0&&<div className="card" style={{padding:"8px 12px"}}>
            {mood.slice(0,20).map(m=>{const opt=MOODS.find(o=>o.v===m.value);return(
              <div key={m.date} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:64,fontSize:".7rem",color:C.muted}}>{fmt(m.date)}</div>
                <span style={{fontSize:"1.1rem"}}>{opt?.e}</span>
                <span style={{fontSize:".72rem",color:C.muted}}>{opt?.l}</span>
                {m.note&&<span style={{fontSize:".67rem",color:C.muted,flex:1,textAlign:"right"}}>{m.note}</span>}
              </div>
            );})}
          </div>}
        </>}

        {/* ══ TASKS ══ */}
        {tab==="Tasks"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <T>Tasks & Deadlines</T>
            <button className="btn bta" onClick={()=>setMTask(true)}>+ Add</button>
          </div>
          {["high","medium","low"].map(prio=>{
            const ts=tasks.filter(t=>t.priority===prio&&!t.done).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999"));
            if(!ts.length)return null;
            const [pc2,pl]=TPRIO[prio];
            return(
              <div key={prio} style={{marginBottom:10}}>
                <div style={{fontSize:".62rem",color:pc2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>{pl} priority</div>
                {ts.map(t=>{
                  const od=t.due&&t.due<today();
                  return(
                    <div key={t.id} className="trow">
                      <button style={{width:15,height:15,borderRadius:"50%",border:`1.5px solid ${od?C.bad:C.border}`,background:"transparent",cursor:"pointer",flexShrink:0,marginTop:3}} onClick={()=>setTasks(p=>p.map(x=>x.id===t.id?{...x,done:true}:x))}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:".82rem",color:od?C.bad:C.text}}>{t.title}</div>
                        <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
                          <Chip color={pc2}>{t.category}</Chip>
                          {t.due&&<Chip color={od?C.bad:C.muted}>{od?"⚠ ":""}{fmt(t.due)}</Chip>}
                        </div>
                        {t.note&&<div style={{fontSize:".64rem",color:C.muted,marginTop:2}}>{t.note}</div>}
                      </div>
                      <button className="btx" onClick={()=>setTasks(p=>p.filter(x=>x.id!==t.id))}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {tasks.filter(t=>t.done).length>0&&<>
            <Hr/>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Completed</div>
            {tasks.filter(t=>t.done).slice(0,5).map(t=>(
              <div key={t.id} className="trow" style={{opacity:.45}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:C.good,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".55rem",color:"#fff",marginTop:2}}>✓</div>
                <div style={{flex:1,fontSize:".79rem",textDecoration:"line-through",color:C.muted}}>{t.title}</div>
                <button className="btx" onClick={()=>setTasks(p=>p.filter(x=>x.id!==t.id))}>✕</button>
              </div>
            ))}
          </>}
          {tasks.length===0&&<div style={{color:C.muted,textAlign:"center",marginTop:40}}>No tasks yet.</div>}
        </>}

        {/* ══ BUSINESS ══ */}
        {tab==="Business"&&<>
          <div className="row" style={{marginBottom:12}}>
            {[{l:"Revenue",v:`${mRev.toFixed(0)} Kč`,c:C.good},{l:"Expenses",v:`${mBizExp.toFixed(0)} Kč`,c:C.bad},{l:"Profit",v:`${mProfit>=0?"+":""}${mProfit.toFixed(0)} Kč`,c:mProfit>=0?C.good:C.bad},{l:"Pending",v:`${pendingVal.toFixed(0)} Kč`,c:C.accent}].map(s=><Stat key={s.l} label={s.l} value={s.v} color={s.c}/>)}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:".68rem",color:C.muted,textTransform:"uppercase",letterSpacing:".07em"}}>Orders</div>
            <button className="btn bta btsm" onClick={()=>setMOrder(true)}>+ Order</button>
          </div>
          {orders.length===0&&<div style={{fontSize:".73rem",color:C.muted,marginBottom:10}}>No orders yet.</div>}
          {orders.slice(0,10).map(o=>{
            const cl=clients.find(c=>c.id==o.clientId);
            const [sc,sl]=OSTATUS[o.status]||[C.muted,"?"];
            return(
              <div key={o.id} className="orow">
                <Chip color={sc} bg={sc+"18"}>{sl}</Chip>
                <div style={{flex:1}}>
                  <div style={{fontSize:".8rem"}}>{o.desc}</div>
                  {cl&&<div style={{fontSize:".62rem",color:C.muted}}>{cl.name}</div>}
                  <div style={{fontSize:".62rem",color:C.muted}}>{fmt(o.date)}</div>
                </div>
                <span style={{color:C.good,fontSize:".8rem"}}>{o.amount.toFixed(0)} Kč</span>
                <select className="sel" style={{fontSize:".63rem",padding:"3px 6px"}} value={o.status} onChange={e=>setOrders(p=>p.map(x=>x.id===o.id?{...x,status:e.target.value}:x))}>
                  {Object.entries(OSTATUS).map(([k,[,l]])=><option key={k} value={k}>{l}</option>)}
                </select>
                <button className="btx" onClick={()=>setOrders(p=>p.filter(x=>x.id!==o.id))}>✕</button>
              </div>
            );
          })}
          <Hr/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
            <div style={{fontSize:".68rem",color:C.muted,textTransform:"uppercase",letterSpacing:".07em"}}>Clients</div>
            <button className="btn btg btsm" onClick={()=>setMClient(true)}>+ Client</button>
          </div>
          {clients.length===0&&<div style={{fontSize:".73rem",color:C.muted,marginBottom:10}}>No clients yet.</div>}
          {clients.map(cl=>{
            const clOrders=orders.filter(o=>o.clientId==cl.id);
            const clRev=clOrders.reduce((s,o)=>s+o.amount,0);
            const clPending=clOrders.filter(o=>o.status==="pending").length;
            return(
              <div key={cl.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.accent+"22",border:`1px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".8rem",color:C.accent,flexShrink:0,fontFamily:"'Lora',serif",fontWeight:600}}>{cl.name.charAt(0).toUpperCase()}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:".84rem"}}>{cl.name}</div>
                  {cl.contact&&<div style={{fontSize:".63rem",color:C.muted}}>{cl.contact}</div>}
                  {cl.note&&<div style={{fontSize:".63rem",color:C.muted,fontStyle:"italic"}}>{cl.note}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:".75rem",color:C.good}}>{clRev.toFixed(0)} Kč</div>
                  <div style={{fontSize:".6rem",color:C.muted}}>{clOrders.length} order{clOrders.length!==1?"s":""}{clPending>0?` · ${clPending} pending`:""}</div>
                </div>
                <button className="btx" onClick={()=>setClients(p=>p.filter(x=>x.id!==cl.id))}>✕</button>
              </div>
            );
          })}
          <Hr/>
          <div className="card">
            <T>Log Revenue / Expense</T>
            <div className="row">
              <div><L>Type</L><select className="sel" value={fBiz.type} onChange={e=>setFBiz(p=>({...p,type:e.target.value}))}><option value="revenue">Revenue</option><option value="expense">Expense</option></select></div>
              <div style={{flex:1}}><L>Category</L><input className="inp" placeholder="Services, Tools…" value={fBiz.category} onChange={e=>setFBiz(p=>({...p,category:e.target.value}))}/></div>
              <div style={{width:86}}><L>Amount Kč</L><input type="number" className="inp" placeholder="0" value={fBiz.amount} onChange={e=>setFBiz(p=>({...p,amount:e.target.value}))}/></div>
            </div>
            <div className="row" style={{marginTop:7}}>
              <div style={{flex:1}}><L>Note</L><input className="inp" placeholder="Optional" value={fBiz.note} onChange={e=>setFBiz(p=>({...p,note:e.target.value}))}/></div>
              <div><L>Date</L><input type="date" className="inp" value={fBiz.date} onChange={e=>setFBiz(p=>({...p,date:e.target.value}))}/></div>
            </div>
            <button className="btn bta" style={{marginTop:11}} onClick={addBiz}>Add</button>
          </div>
          <div className="card" style={{padding:"8px 12px"}}>
            {biz.length===0&&<div style={{color:C.muted,textAlign:"center"}}>No entries.</div>}
            {biz.slice(0,20).map(e=>(
              <div key={e.id} className="frow">
                <Chip color={e.type==="revenue"?C.good:C.bad} bg={(e.type==="revenue"?C.good:C.bad)+"18"}>{e.type}</Chip>
                <div style={{flex:1}}><div style={{fontSize:".79rem"}}>{e.category}{e.note?<span style={{color:C.muted}}> — {e.note}</span>:""}</div><div style={{fontSize:".62rem",color:C.muted,marginTop:1}}>{fmt(e.date)}</div></div>
                <span style={{color:e.type==="revenue"?C.good:C.bad,fontSize:".79rem"}}>{e.type==="revenue"?"+":"-"}{e.amount.toFixed(0)} Kč</span>
                <button className="btx" onClick={()=>setBiz(p=>p.filter(x=>x.id!==e.id))}>✕</button>
              </div>
            ))}
          </div>
        </>}

        {/* ══ REPORT ══ */}
        {tab==="Report"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <T>Monthly Report</T>
            <input type="month" className="inp" style={{width:"auto"}} value={repMonth} onChange={e=>setRepMonth(e.target.value)}/>
          </div>
          <div style={{fontSize:".85rem",color:C.accent,marginBottom:14,fontFamily:"'Lora',serif",fontStyle:"italic"}}>{fmtM(repMonth)}</div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Finance</div>
            <div className="row">{[{l:"Income",v:`${rep.rInc.toFixed(0)} Kč`,c:C.good},{l:"Expenses",v:`${rep.rExp.toFixed(0)} Kč`,c:C.bad},{l:"Balance",v:`${rep.rBal>=0?"+":""}${Math.abs(rep.rBal).toFixed(0)} Kč`,c:rep.rBal>=0?C.good:C.bad}].map(s=><Stat key={s.l} label={s.l} value={s.v} color={s.c}/>)}</div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Business</div>
            <div className="row">{[{l:"Revenue",v:`${rep.rRev.toFixed(0)} Kč`,c:C.good},{l:"Expenses",v:`${rep.rBExp.toFixed(0)} Kč`,c:C.bad},{l:"Profit",v:`${rep.rProfit>=0?"+":""}${rep.rProfit.toFixed(0)} Kč`,c:rep.rProfit>=0?C.good:C.bad}].map(s=><Stat key={s.l} label={s.l} value={s.v} color={s.c}/>)}</div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Habits</div>
            {rep.hStats.map(h=>(
              <div key={h.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:88,fontSize:".71rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>
                <div style={{flex:1}}><Bar pct={h.pct} color={h.color}/></div>
                <div style={{width:32,textAlign:"right",fontSize:".67rem",color:C.muted}}>{h.pct}%</div>
                <div style={{width:42,textAlign:"right",fontSize:".64rem",color:C.muted}}>{h.days}/{h.sch}d</div>
              </div>
            ))}
            {rep.hStats.length===0&&<div style={{fontSize:".72rem",color:C.muted}}>No habits.</div>}
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>Goals</div>
            {rep.gStats.map(g=>(
              <div key={g.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:118,fontSize:".71rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.title}</div>
                <div style={{flex:1}}><Bar pct={g.pct} color={g.pct>=100?C.good:C.accent}/></div>
                <div style={{width:32,textAlign:"right",fontSize:".67rem",color:C.muted}}>{g.pct}%</div>
              </div>
            ))}
            {rep.gStats.length===0&&<div style={{fontSize:".72rem",color:C.muted}}>No goals.</div>}
          </div>
          <div className="row" style={{marginBottom:14}}>
            <Stat label="Avg Sleep" value={rep.avgS} color={C.accent}/>
            <Stat label="Avg Mood" value={`${rep.avgM}/5`} color={C.accent}/>
          </div>
          {subs.length>0&&<div>
            <div style={{fontSize:".62rem",color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7}}>School</div>
            {subs.map(s=>{const st=subStats(s.id);return(
              <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:".77rem",alignItems:"center",gap:8}}>
                <span style={{flex:1}}>{s.name}</span>
                <span style={{color:C.muted}}>{hm(st.totalMins)} studied</span>
                {st.wavg!==null&&<Chip color={gc(st.wavg)} bg={gc(st.wavg)+"22"}>avg {st.wavg.toFixed(2)}</Chip>}
              </div>
            );})}
          </div>}
        </>}
      </div>

      {/* ── MODALS ── */}
      {mHabit&&<div className="ov" onClick={()=>setMHabit(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Habit</div>
        <L>Name</L><input className="inp" placeholder="e.g. Meditate" value={fHabit.name} onChange={e=>setFHabit(p=>({...p,name:e.target.value}))} autoFocus onKeyDown={e=>e.key==="Enter"&&addHabit()}/>
        <L>Icon (emoji)</L><input className="inp" value={fHabit.icon} onChange={e=>setFHabit(p=>({...p,icon:e.target.value}))}/>
        <L>Type</L>
        <select className="sel" style={{width:"100%"}} value={fHabit.type} onChange={e=>setFHabit(p=>({...p,type:e.target.value}))}>
          <option value="check">Check-off (done / not done)</option>
          <option value="count">Count / Metric (with unit)</option>
        </select>
        {fHabit.type==="count"&&<div className="row"><div style={{flex:1}}><L>Unit</L><input className="inp" placeholder="pages, km, liters…" value={fHabit.unit} onChange={e=>setFHabit(p=>({...p,unit:e.target.value}))}/></div><div><L>Daily target</L><input type="number" className="inp" style={{width:80}} placeholder="8" value={fHabit.target} onChange={e=>setFHabit(p=>({...p,target:e.target.value}))}/></div></div>}
        <L>Frequency</L>
        <select className="sel" style={{width:"100%"}} value={fHabit.freq.type} onChange={e=>setFHabit(p=>({...p,freq:{...p.freq,type:e.target.value}}))}>
          <option value="daily">Daily</option><option value="every_x_days">Every X days</option><option value="weekly">Weekly (pick days)</option><option value="monthly">Monthly</option>
        </select>
        {fHabit.freq.type==="every_x_days"&&<div><L>Every how many days?</L><input type="number" className="inp" style={{width:80}} min={2} value={fHabit.freq.x||2} onChange={e=>setFHabit(p=>({...p,freq:{...p.freq,x:parseInt(e.target.value)||2}}))}/></div>}
        {fHabit.freq.type==="weekly"&&<div><L>Pick days</L><div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>{WDAYS.map((d,i)=><button key={i} className="btn" style={{padding:"4px 7px",fontSize:".65rem",background:(fHabit.freq.days||[]).includes(i)?C.accent:C.border,color:(fHabit.freq.days||[]).includes(i)?"#fff":C.muted}} onClick={()=>{const ds=fHabit.freq.days||[];setFHabit(p=>({...p,freq:{...p.freq,days:ds.includes(i)?ds.filter(x=>x!==i):[...ds,i]}}));}}>{d}</button>)}</div></div>}
        {fHabit.freq.type==="monthly"&&<div><L>Day of month</L><input type="number" className="inp" style={{width:78}} min={1} max={31} value={fHabit.freq.day||1} onChange={e=>setFHabit(p=>({...p,freq:{...p.freq,day:parseInt(e.target.value)||1}}))}/></div>}
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addHabit}>Add</button><button className="btn btg" style={{flex:1}} onClick={()=>setMHabit(false)}>Cancel</button></div>
      </div></div>}

      {mCount!==null&&<div className="ov" onClick={()=>setMCount(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        {(()=>{const h=habits.find(x=>x.id===mCount);return(<><div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>Log {h?.name}</div><L>Today's {h?.unit||"amount"}</L><input type="number" className="inp" placeholder="0" value={countV} onChange={e=>setCountV(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&logCount()}/><div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={logCount}>Log</button><button className="btn btg" style={{flex:1}} onClick={()=>setMCount(null)}>Cancel</button></div></>);})()}
      </div></div>}

      {mGoal&&<div className="ov" onClick={()=>setMGoal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Goal</div>
        <L>Title</L><input className="inp" placeholder="e.g. Run 100km" value={fGoal.title} onChange={e=>setFGoal(p=>({...p,title:e.target.value}))} autoFocus/>
        <L>Type</L>
        <select className="sel" style={{width:"100%"}} value={fGoal.type} onChange={e=>setFGoal(p=>({...p,type:e.target.value}))}>
          <option value="numeric">Numeric (track progress)</option><option value="completable">Completable (done / not done)</option>
        </select>
        {fGoal.type==="numeric"&&<div className="row"><div style={{flex:1}}><L>Target</L><input type="number" className="inp" placeholder="100" value={fGoal.target} onChange={e=>setFGoal(p=>({...p,target:e.target.value}))}/></div><div style={{flex:1}}><L>Unit</L><input className="inp" placeholder="km, push-ups…" value={fGoal.unit} onChange={e=>setFGoal(p=>({...p,unit:e.target.value}))}/></div><div><L>Current</L><input type="number" className="inp" style={{width:72}} placeholder="0" value={fGoal.current} onChange={e=>setFGoal(p=>({...p,current:e.target.value}))}/></div></div>}
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addGoal}>Create</button><button className="btn btg" style={{flex:1}} onClick={()=>setMGoal(false)}>Cancel</button></div>
      </div></div>}

      {mSub&&<div className="ov" onClick={()=>setMSub(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Subject</div>
        <L>Name</L><input className="inp" placeholder="e.g. Physics" value={fSub.name} onChange={e=>setFSub(p=>({...p,name:e.target.value}))} autoFocus onKeyDown={e=>e.key==="Enter"&&addSub()}/>
        <L>Color</L><input type="color" value={fSub.color} onChange={e=>setFSub(p=>({...p,color:e.target.value}))} style={{width:"100%",height:32,border:`1px solid ${C.border}`,background:"none",borderRadius:6,cursor:"pointer"}}/>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addSub}>Add</button><button className="btn btg" style={{flex:1}} onClick={()=>setMSub(false)}>Cancel</button></div>
      </div></div>}

      {mFgoal&&<div className="ov" onClick={()=>setMFgoal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Saving Goal</div>
        <L>Name</L><input className="inp" placeholder="Car, Vacation…" value={fFgoal.name} onChange={e=>setFFgoal(p=>({...p,name:e.target.value}))} autoFocus/>
        <div className="row"><div style={{flex:1}}><L>Target Kč</L><input type="number" className="inp" placeholder="50000" value={fFgoal.target} onChange={e=>setFFgoal(p=>({...p,target:e.target.value}))}/></div><div style={{flex:1}}><L>Already saved Kč</L><input type="number" className="inp" placeholder="0" value={fFgoal.saved} onChange={e=>setFFgoal(p=>({...p,saved:e.target.value}))}/></div></div>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addFgoal}>Create</button><button className="btn btg" style={{flex:1}} onClick={()=>setMFgoal(false)}>Cancel</button></div>
      </div></div>}

      {mRecur&&<div className="ov" onClick={()=>setMRecur(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>Recurring Payment</div>
        <L>Name</L><input className="inp" placeholder="Rent, Spotify…" value={fRecur.name} onChange={e=>setFRecur(p=>({...p,name:e.target.value}))} autoFocus/>
        <div className="row"><div><L>Type</L><select className="sel" value={fRecur.type} onChange={e=>setFRecur(p=>({...p,type:e.target.value}))}><option value="expense">Expense</option><option value="income">Income</option></select></div><div style={{flex:1}}><L>Amount Kč</L><input type="number" className="inp" placeholder="0" value={fRecur.amount} onChange={e=>setFRecur(p=>({...p,amount:e.target.value}))}/></div><div><L>Day of month</L><input type="number" className="inp" style={{width:58}} min={1} max={28} value={fRecur.day} onChange={e=>setFRecur(p=>({...p,day:parseInt(e.target.value)||1}))}/></div></div>
        <L>Note</L><input className="inp" placeholder="Optional" value={fRecur.note} onChange={e=>setFRecur(p=>({...p,note:e.target.value}))}/>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addRecur}>Add</button><button className="btn btg" style={{flex:1}} onClick={()=>setMRecur(false)}>Cancel</button></div>
      </div></div>}

      {mTask&&<div className="ov" onClick={()=>setMTask(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Task / Deadline</div>
        <L>Title</L><input className="inp" placeholder="e.g. Math exam, Pay rent" value={fTask.title} onChange={e=>setFTask(p=>({...p,title:e.target.value}))} autoFocus/>
        <div className="row"><div style={{flex:1}}><L>Category</L><select className="sel" style={{width:"100%"}} value={fTask.category} onChange={e=>setFTask(p=>({...p,category:e.target.value}))}>{TCATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><L>Priority</L><select className="sel" value={fTask.priority} onChange={e=>setFTask(p=>({...p,priority:e.target.value}))}>{Object.entries(TPRIO).map(([k,[,l]])=><option key={k} value={k}>{l}</option>)}</select></div></div>
        <L>Due date</L><input type="date" className="inp" value={fTask.due} onChange={e=>setFTask(p=>({...p,due:e.target.value}))}/>
        <L>Note</L><input className="inp" placeholder="Optional" value={fTask.note} onChange={e=>setFTask(p=>({...p,note:e.target.value}))}/>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addTask}>Add</button><button className="btn btg" style={{flex:1}} onClick={()=>setMTask(false)}>Cancel</button></div>
      </div></div>}

      {mOrder&&<div className="ov" onClick={()=>setMOrder(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Order</div>
        <div className="row"><div style={{flex:1}}><L>Client</L><select className="sel" style={{width:"100%"}} value={fOrder.clientId} onChange={e=>setFOrder(p=>({...p,clientId:e.target.value}))}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div style={{width:88}}><L>Amount Kč</L><input type="number" className="inp" placeholder="0" value={fOrder.amount} onChange={e=>setFOrder(p=>({...p,amount:e.target.value}))}/></div></div>
        <L>Description</L><input className="inp" placeholder="What was ordered…" value={fOrder.desc} onChange={e=>setFOrder(p=>({...p,desc:e.target.value}))}/>
        <div className="row"><div style={{flex:1}}><L>Date</L><input type="date" className="inp" value={fOrder.date} onChange={e=>setFOrder(p=>({...p,date:e.target.value}))}/></div><div><L>Status</L><select className="sel" value={fOrder.status} onChange={e=>setFOrder(p=>({...p,status:e.target.value}))}>{Object.entries(OSTATUS).map(([k,[,l]])=><option key={k} value={k}>{l}</option>)}</select></div></div>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addOrder}>Add Order</button><button className="btn btg" style={{flex:1}} onClick={()=>setMOrder(false)}>Cancel</button></div>
      </div></div>}

      {mClient&&<div className="ov" onClick={()=>setMClient(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Lora',serif",fontSize:"1rem",marginBottom:12}}>New Client</div>
        <L>Name</L><input className="inp" placeholder="Client name" value={fClient.name} onChange={e=>setFClient(p=>({...p,name:e.target.value}))} autoFocus/>
        <L>Contact</L><input className="inp" placeholder="Email / phone" value={fClient.contact} onChange={e=>setFClient(p=>({...p,contact:e.target.value}))}/>
        <L>Note</L><input className="inp" placeholder="Optional" value={fClient.note} onChange={e=>setFClient(p=>({...p,note:e.target.value}))}/>
        <div className="row" style={{marginTop:15}}><button className="btn bta" style={{flex:1}} onClick={addClient}>Add</button><button className="btn btg" style={{flex:1}} onClick={()=>setMClient(false)}>Cancel</button></div>
      </div></div>}
    </div>
  );
}
