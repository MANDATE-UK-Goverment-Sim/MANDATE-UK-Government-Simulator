(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const content = $('#content');
  const STORAGE_KEY = 'mandate_game_v4';

  const BASE_PARTY_COLORS = {
    'Progressive Labour':'#e24d5d',
    'Conservative Union':'#477fdd',
    'Liberal Alliance':'#e8b648',
    'Reform Front':'#55b8cf',
    'Green Movement':'#55b96b',
    'Civic Independents':'#9c86ca'
  };

  let PARTY_COLORS = {...BASE_PARTY_COLORS};
  let partyOrder = Object.keys(PARTY_COLORS);
  const billStages = ['Draft','First Reading','Committee','Second Reading','Final Vote','Assent'];

  const initialState = () => ({
    version: 4,
    phase: 'setup',
    country: 'Avalon',
    governmentParty: 'Progressive Labour',
    primeMinister: 'Prime Minister',
    partyProfile: { shortName:'PL', slogan:'A fair future, built together', color:'#3b82f6', ideology:'Broad church' },
    openingCampaign: { week:0, actionsLeft:0, score:0, complete:false, result:null },
    date: '2029-05-01',
    week: 1,
    nextElectionWeeks: 150,
    approval: 51.8,
    politicalCapital: 72,
    treasury: 38.4,
    campaignFunds: 16.2,
    majority: 16,
    stats: {
      gdpGrowth: 1.74,
      inflation: 3.18,
      unemployment: 4.7,
      debt: 2680,
      deficit: 104,
      nhsWait: 17.2,
      crime: 50.6,
      migration: 612,
      wageGrowth: 2.4,
      housing: 241
    },
    budget: { incomeTax: 20, corporationTax: 25, health: 182, education: 112, defence: 62, welfare: 136, infrastructure: 54 },
    seats: {
      'Progressive Labour':328,
      'Conservative Union':170,
      'Liberal Alliance':74,
      'Reform Front':36,
      'Green Movement':20,
      'Civic Independents':12
    },
    polls: {
      'Progressive Labour':39.4,
      'Conservative Union':28.8,
      'Liberal Alliance':13.5,
      'Reform Front':9.1,
      'Green Movement':6.1,
      'Civic Independents':3.1
    },
    cabinet: [
      {id:1,name:'Evelyn Hart',role:'Chancellor of the Exchequer',competence:83,loyalty:76,profile:'EH'},
      {id:2,name:'Daniel Reed',role:'Home Secretary',competence:70,loyalty:67,profile:'DR'},
      {id:3,name:'Amelia Knox',role:'Foreign Secretary',competence:79,loyalty:82,profile:'AK'},
      {id:4,name:'Thomas Vale',role:'Health Secretary',competence:73,loyalty:71,profile:'TV'},
      {id:5,name:'Priya Morgan',role:'Education Secretary',competence:88,loyalty:64,profile:'PM'},
      {id:6,name:'Oliver Grant',role:'Defence Secretary',competence:68,loyalty:89,profile:'OG'}
    ],
    bills: [
      {id:101,title:'Cost of Living Relief Bill',category:'Economy',description:'Targeted household support, energy assistance and a temporary essentials rebate.',stage:2,support:57,cost:6.8,impact:{approval:2.1,inflation:-0.05,deficit:5}},
      {id:102,title:'National Transport Fares Bill',category:'Transport',description:'Caps local bus fares and funds regional transport authorities.',stage:1,support:61,cost:3.2,impact:{approval:1.4,deficit:2.5}},
      {id:103,title:'Higher Education Opportunity Bill',category:'Education',description:'Removes tuition charges for eligible 18–21 year olds in Avalon.',stage:0,support:54,cost:8.4,impact:{approval:2.4,deficit:7.4}}
    ],
    media: [
      {week:1,type:'Government',headline:'New administration promises a programme of national renewal',body:'Ministers arrive in office facing pressure on prices, public services and the deficit.'},
      {week:1,type:'Economy',headline:'Markets wait for Chancellor’s first fiscal signals',body:'Business groups want stability while unions call for stronger household support.'}
    ],
    crises: [],
    resolvedCrises: [],
    history: [],
    pmqsUsed: false,
    nextPMQsWeek: 2,
    pmqsHistory: [],
    cabinetMeetingUsed: false,
    cabinetMeetingHistory: [],
    relations: { unitedStates:58, europe:55, monarchy:72 },
    weeklyEvent: null,
    weeklyEventHistory: [],
    calendar: { speeches: [] },
    electionHeld: false,
    constitutional: {
      monarch: 'King',
      snapElection: null,
      resignation: null,
      governmentEnded: false
    }
  });

  let state = loadState();
  let currentView = 'dashboard';
  let supabase = null;
  let cloudGameId = null;
  syncPartyRegistry();

  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return initialState();
      const parsed = JSON.parse(raw);
      const merged = {...initialState(), ...parsed};
      // Preserve v1/v2 saves as already-established governments.
      if(!parsed.phase) merged.phase = 'government';
      if(!Array.isArray(merged.pmqsHistory)) merged.pmqsHistory = [];
      if(!Array.isArray(merged.cabinetMeetingHistory)) merged.cabinetMeetingHistory = [];
      if(typeof merged.cabinetMeetingUsed !== 'boolean') merged.cabinetMeetingUsed = false;
      if(!merged.partyProfile) merged.partyProfile={shortName:'GOV',slogan:'Country first',color:'#3b82f6',ideology:'Broad church'};
      if(!merged.relations) merged.relations={unitedStates:58,europe:55,monarchy:72};
      if(!merged.calendar) merged.calendar={speeches:[]};
      if(!Array.isArray(merged.calendar.speeches)) merged.calendar.speeches=[];
      if(!Array.isArray(merged.weeklyEventHistory)) merged.weeklyEventHistory=[];
      if(typeof merged.nextPMQsWeek!=='number') merged.nextPMQsWeek=(merged.week||1)%2===0?(merged.week||2):(merged.week||1)+1;
      if(merged.weeklyEvent===undefined) merged.weeklyEvent=null;
      return merged;
    } catch { return initialState(); }
  }

  function syncPartyRegistry(){
    const player=state.governmentParty||'Progressive Labour';
    const playerColor=state.partyProfile?.color||BASE_PARTY_COLORS['Progressive Labour'];
    PARTY_COLORS={...BASE_PARTY_COLORS,[player]:playerColor};
    const rivals=Object.keys(BASE_PARTY_COLORS).filter(p=>p!==player&&p!=='Progressive Labour');
    partyOrder=[player,...rivals];
    // Keep exactly six national parties and remove the placeholder when the player renamed it.
    if(player!=='Progressive Labour') delete PARTY_COLORS['Progressive Labour'];
  }

  function saveLocal(show=true){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('#saveText').textContent = 'Saved locally';
    if(show) toast('Game saved');
  }

  async function initCloud(){
    const cfg = window.MANDATE_CONFIG || {};
    if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;
    try{
      supabase = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
      let {data:{session}} = await supabase.auth.getSession();
      if(!session){ const out = await supabase.auth.signInAnonymously(); session = out.data.session; }
      if(session){ $('#saveText').textContent = 'Cloud + local ready'; await loadCloud(session.user.id); }
    }catch(err){ console.warn('Cloud unavailable',err); }
  }

  async function loadCloud(uid){
    if(!supabase) return;
    const {data,error}=await supabase.from('games').select('id,state').eq('user_id',uid).eq('slot_name','Main Save v4').maybeSingle();
    if(error) return;
    if(data?.state){ cloudGameId=data.id; state={...initialState(),...data.state}; if(!data.state.phase)state.phase='government'; syncPartyRegistry(); saveLocal(false); render(); }
  }

  async function saveCloud(){
    if(!supabase) return;
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user) return;
      const payload={user_id:user.id,slot_name:'Main Save v4',country_name:state.country,current_week:Math.max(1,state.week),state,updated_at:new Date().toISOString()};
      let res;
      if(cloudGameId) res=await supabase.from('games').update(payload).eq('id',cloudGameId).select().single();
      else res=await supabase.from('games').insert(payload).select().single();
      if(res.data){cloudGameId=res.data.id;$('#saveText').textContent='Saved to cloud';}
    }catch(err){console.warn(err)}
  }

  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function r(min,max){return Math.random()*(max-min)+min;}
  function fmt(n,d=1){return Number(n).toFixed(d);}
  function money(n){return `£${fmt(n,1)}bn`;}
  function signed(n,suffix=''){return `${n>=0?'+':''}${fmt(n,1)}${suffix}`;}
  function approvalClass(v){return v>=0?'good':'bad';}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function isoAddDays(iso,days){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
  function dateDiffDays(from,to){return Math.ceil((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000);}
  function prettyDate(iso){if(!iso)return 'To be set';return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}
  function reached(iso){return !!iso && new Date(state.date+'T12:00:00')>=new Date(iso+'T12:00:00');}
  function monarchLabel(){return `the ${state.constitutional?.monarch||'King'}`;}
  function ensureConstitutional(){if(!state.constitutional)state.constitutional={monarch:'King',snapElection:null,resignation:null,governmentEnded:false};}

  function toast(msg){ const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800); }
  function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');$('#modal').setAttribute('aria-hidden','false');}
  function closeModal(){$('#modal').classList.add('hidden');$('#modal').setAttribute('aria-hidden','true');}

  const CABINET_ROLES = [
    'Chancellor of the Exchequer','Home Secretary','Foreign Secretary','Health Secretary',
    'Education Secretary','Defence Secretary','Justice Secretary','Transport Secretary'
  ];
  const CABINET_SUGGESTIONS = ['Evelyn Hart','Daniel Reed','Amelia Knox','Thomas Vale','Priya Morgan','Oliver Grant','Sofia Hale','Marcus Bell'];

  function inGovernment(){return state.phase==='government';}

  function setupPollsForPlayer(){
    syncPartyRegistry();
    const rivals=partyOrder.filter(p=>p!==state.governmentParty);
    const vals=[31.5,14.0,9.0,6.5,4.8];
    state.polls={[state.governmentParty]:34.2};
    rivals.forEach((p,i)=>state.polls[p]=vals[i]||2);
    normalizePolls();
    state.seats={};partyOrder.forEach(p=>state.seats[p]=0);
  }

  function renderPregame(){
    if(state.phase==='setup'){
      return `<div class="campaign-shell"><div class="campaign-hero blue"><div><span class="phase-chip">NEW GAME • ELECTION CAMPAIGN</span><h1>Build the party. Win the country.</h1><p>Every premiership in MANDATE starts at the ballot box. Create your leader and party, survive a compulsory two-week campaign, face the general election, then form your Cabinet only if voters give you the numbers.</p></div><div class="campaign-big-number">14<small>days to polling day</small></div></div>
      <div class="setup-layout section-space"><div class="panel setup-card"><div class="panel-title-row"><div><h3>Create your political movement</h3><div class="muted small">These details follow you through Parliament, elections and government.</div></div><span class="tag blue-tag">STEP 1 OF 4</span></div>
      <div class="form-grid roomy-form"><div class="field"><label>Prime Minister / Leader name</label><input id="setupLeader" maxlength="40" placeholder="e.g. Mason Sanders"></div><div class="field"><label>Party name</label><input id="setupParty" maxlength="42" placeholder="e.g. National Labour Party"></div><div class="field"><label>Short name</label><input id="setupShort" maxlength="8" placeholder="e.g. NLP"></div><div class="field"><label>Party colour</label><input id="setupColor" type="color" value="#3b82f6"></div><div class="field" style="grid-column:1/-1"><label>Campaign slogan</label><input id="setupSlogan" maxlength="80" placeholder="A new chapter for Avalon"></div><div class="field"><label>Party character</label><select id="setupIdeology"><option>Broad church</option><option>Social democratic</option><option>Centrist</option><option>Conservative</option><option>Liberal</option><option>Green reformist</option><option>Populist reform</option></select></div><div class="field"><label>Monarch</label><select id="setupMonarch"><option>King</option><option>Queen</option></select></div></div>
      <button class="primary big-primary full section-space" id="beginCampaignBtn">Launch the two-week campaign →</button></div>
      <div class="panel fun-panel"><div class="eyebrow">HOW A NEW GAME WORKS</div><div class="big-step-list"><div><b>01</b><span><strong>Create your party</strong>Choose the leader, name, slogan and colour.</span></div><div><b>02</b><span><strong>Campaign for 2 weeks</strong>Campaign choices carry real risk. Doing nothing can cost you Downing House.</span></div><div><b>03</b><span><strong>General Election</strong>There is no guaranteed majority. You can lose.</span></div><div><b>04</b><span><strong>Form your Cabinet</strong>Only election winners get to build a government.</span></div></div></div></div></div>`;
    }
    if(state.phase==='campaign'){
      const c=state.openingCampaign;
      const days=c.week===1?'Days 1–7':'Days 8–14';
      return `<div class="campaign-shell"><div class="campaign-hero blue"><div><span class="phase-chip">CAMPAIGN WEEK ${c.week} OF 2 • ${days}</span><h1>${escapeHtml(state.partyProfile.slogan||'Win the future.')}</h1><p><b>${escapeHtml(state.primeMinister)}</b> is leading the <b>${escapeHtml(state.governmentParty)}</b> into a national general election. You have <b>${c.actionsLeft}</b> campaign actions remaining this week. Poor choices can now lose the election.</p></div><div class="campaign-big-number">${fmt(state.polls[state.governmentParty],1)}%<small>national polling</small></div></div>
      <div class="grid grid-2 section-space"><div class="panel"><div class="panel-title-row"><h3>National voting intention</h3><span class="tag blue-tag">£${fmt(state.campaignFunds,1)}bn fund</span></div><div class="poll-chart">${partyOrder.map(p=>`<div class="poll-row"><label>${escapeHtml(p)}</label><div class="poll-track"><span style="width:${state.polls[p]*2.2}%;background:${PARTY_COLORS[p]}"></span></div><b>${fmt(state.polls[p],1)}%</b></div>`).join('')}</div><div class="callout section-space">Campaign score: <b>${fmt(c.score,1)}</b>. Strong polling helps, but campaign quality and election-night uncertainty matter too.</div></div>
      <div class="panel"><div class="panel-title-row"><h3>Campaign HQ</h3><span class="tag">Actions left ${c.actionsLeft}</span></div><div class="opening-actions"><button class="campaign-tile" data-opening-campaign="doors"><span>🚪</span><b>Doorstep blitz</b><small>Reliable, but not risk-free • £0.6bn</small></button><button class="campaign-tile" data-opening-campaign="rally"><span>🎤</span><b>National rally</b><small>Can soar or flop • £0.8bn</small></button><button class="campaign-tile" data-opening-campaign="debate"><span>📺</span><b>TV leaders' debate</b><small>Very high risk, very high reward • £0.5bn</small></button><button class="campaign-tile" data-opening-campaign="manifesto"><span>📘</span><b>Manifesto launch</b><small>Policy credibility, but scrutiny bites • £0.7bn</small></button></div><div class="callout blue-callout section-space">You can finish the week without using every action, but wasted campaign days may leave your party short of the 321 seats needed to govern.</div></div></div></div>`;
    }
    if(state.phase==='election'){
      return `<div class="campaign-shell"><div class="election-night-card"><span class="phase-chip">GENERAL ELECTION • POLLING DAY</span><div class="ballot-icon">✓</div><h1>Avalon has voted.</h1><p>The polls are closed. Ballot boxes are arriving at count centres across all 640 constituencies. This result is not guaranteed.</p><div class="election-preview"><span>${escapeHtml(state.governmentParty)}</span><b>${fmt(state.polls[state.governmentParty],1)}%</b><small>final campaign poll • score ${fmt(state.openingCampaign.score||0,1)}</small></div><button class="primary big-primary" id="countElectionBtn">Begin election night →</button></div></div>`;
    }
    if(state.phase==='defeat'){
      const result=state.openingCampaign?.result||{};
      return `<div class="campaign-shell"><div class="election-night-card defeat-card"><span class="phase-chip">GENERAL ELECTION • FINAL RESULT</span><div class="ballot-icon defeat">✕</div><h1>The country chose another government.</h1><p>${escapeHtml(state.primeMinister)} fought the campaign, but <b>${escapeHtml(state.governmentParty)}</b> finished on <b>${result.playerSeats||0} seats</b>. You needed 321 to enter government.</p><div class="election-preview"><span>Seats won</span><b>${result.playerSeats||0} / 640</b><small>${fmt(result.poll||0,1)}% final polling • campaign score ${fmt(state.openingCampaign.score||0,1)}</small></div><button class="primary big-primary" id="restartAfterDefeatBtn">Return to party creation →</button></div></div>`;
    }
    if(state.phase==='cabinet_setup'){
      const result=state.openingCampaign?.result;
      return `<div class="campaign-shell"><div class="campaign-hero victory"><div><span class="phase-chip">ELECTION WIN • ${result?.playerSeats||state.seats[state.governmentParty]} SEATS</span><h1>Now build your government.</h1><p>${escapeHtml(state.primeMinister)}, the election is over. Before your premiership formally begins, appoint the senior ministers who will sit around the Cabinet table.</p></div><div class="campaign-big-number">${result?.majority||state.majority}<small>working majority</small></div></div>
      <div class="panel section-space"><div class="panel-title-row"><div><h3>Form the Cabinet</h3><div class="muted small">Name every senior minister. Competence and loyalty are revealed when government begins.</div></div><span class="tag green">STEP 4 OF 4</span></div><div class="cabinet-builder">${CABINET_ROLES.map((role,i)=>`<div class="cabinet-builder-row"><div><b>${role}</b><small>Senior Cabinet post</small></div><input data-cabinet-name="${i}" value="${CABINET_SUGGESTIONS[i]}" maxlength="40"></div>`).join('')}</div><button class="primary big-primary full section-space" id="formGovernmentBtn">Appoint Cabinet & begin premiership →</button></div></div>`;
    }
    return '';
  }

  function beginOpeningCampaign(){
    const leader=$('#setupLeader')?.value.trim();
    const party=$('#setupParty')?.value.trim();
    const shortName=$('#setupShort')?.value.trim().toUpperCase();
    const slogan=$('#setupSlogan')?.value.trim();
    if(!leader||!party||!shortName){toast('Add your leader, party name and short name');return;}
    if(Object.keys(BASE_PARTY_COLORS).filter(p=>p!=='Progressive Labour').some(p=>p.toLowerCase()===party.toLowerCase())){toast('Choose an original party name rather than an existing rival');return;}
    state.primeMinister=leader;state.governmentParty=party;
    state.partyProfile={shortName,slogan:slogan||'A new chapter for Avalon',color:$('#setupColor').value,ideology:$('#setupIdeology').value};
    ensureConstitutional();state.constitutional.monarch=$('#setupMonarch').value;
    state.date='2029-05-01';state.week=0;state.phase='campaign';state.campaignFunds=8;
    state.openingCampaign={week:1,actionsLeft:3,score:0,complete:false,result:null};
    setupPollsForPlayer();
    state.media=[{week:0,type:'Election',headline:`${party} launches general election campaign`,body:`${leader} begins a compulsory two-week national campaign under the slogan “${state.partyProfile.slogan}”.`}];
    saveLocal(false);syncPartyRegistry();render();toast('Campaign launched');
  }

  function openingCampaignAction(type){
    const c=state.openingCampaign;if(state.phase!=='campaign'||c.actionsLeft<=0){toast('No campaign actions remaining this week');return;}
    const cfg={
      doors:{cost:.6,min:-.15,max:.80,score:.75,label:'Doorstep blitz'},
      rally:{cost:.8,min:-.55,max:1.20,score:.85,label:'National rally'},
      debate:{cost:.5,min:-1.85,max:1.90,score:.95,label:"TV leaders' debate"},
      manifesto:{cost:.7,min:-.75,max:1.35,score:.90,label:'Manifesto launch'}
    }[type];
    if(state.campaignFunds<cfg.cost){toast('Not enough campaign funds');return;}
    state.campaignFunds-=cfg.cost;c.actionsLeft--;
    const lift=r(cfg.min,cfg.max);movePoll(state.governmentParty,lift);
    c.score=clamp(c.score+cfg.score+lift*.85,-6,14);
    const verdict=lift>.65?'lands well':lift<-.45?'backfires':'produces a mixed reaction';
    addNews('Election',`${cfg.label} ${verdict}`,`${state.governmentParty} moves ${signed(lift,'%')} in campaign tracking. Election victory is not guaranteed.`);
    saveLocal(false);render();toast(`${cfg.label}: ${signed(lift,'%')}`);
  }

  function advanceOpeningCampaign(){
    const c=state.openingCampaign;
    if(c.week===1){c.week=2;c.actionsLeft=3;state.date=isoAddDays(state.date,7);addNews('Election','Campaign enters its final week',`Seven days remain until polling day. ${state.governmentParty} is polling at ${fmt(state.polls[state.governmentParty],1)}%.`);saveLocal(false);render();toast('Campaign Week 2 begins');return;}
    state.date=isoAddDays(state.date,7);state.phase='election';c.complete=true;addNews('Election','Polling stations open across Avalon','The two-week general election campaign is over and voters are casting their ballots.');saveLocal(false);render();toast('Polling day');
  }

  function holdOpeningElection(){
    if(state.phase!=='election')return;
    const playerPoll=state.polls[state.governmentParty]||34;
    const score=state.openingCampaign.score||0;
    const rivals=partyOrder.filter(p=>p!==state.governmentParty);
    const effectivePolls={};
    effectivePolls[state.governmentParty]=Math.max(8,playerPoll+score*.42+r(-2.6,2.6));
    rivals.forEach(p=>effectivePolls[p]=Math.max(1,state.polls[p]+r(-1.1,1.1)));
    const weights={};let weightTotal=0;
    partyOrder.forEach(p=>{weights[p]=Math.max(1,effectivePolls[p]**2.12);weightTotal+=weights[p];});
    const newSeats={};let allocated=0;
    partyOrder.forEach((p,i)=>{const seats=i===partyOrder.length-1?640-allocated:Math.round(weights[p]/weightTotal*640);newSeats[p]=Math.max(0,seats);allocated+=newSeats[p];});
    const correction=640-Object.values(newSeats).reduce((a,b)=>a+b,0);newSeats[partyOrder[partyOrder.length-1]]+=correction;
    const playerSeats=newSeats[state.governmentParty];const won=playerSeats>=321;
    state.seats=newSeats;state.majority=won?playerSeats-321:0;state.electionHeld=true;
    state.openingCampaign.result={playerSeats,majority:state.majority,poll:playerPoll,effectivePoll:effectivePolls[state.governmentParty],date:state.date,won};
    if(won){
      state.approval=clamp(50+score*.45+(playerPoll-34)*.35,43,72);state.politicalCapital=78;state.nextElectionWeeks=208;state.phase='cabinet_setup';
      addNews('Election',`${state.governmentParty} wins the general election`,`${state.primeMinister} wins ${playerSeats} seats and a working majority of ${state.majority}.`);
      saveLocal(false);render();toast('Election victory');
    }else{
      state.phase='defeat';
      addNews('Election',`${state.governmentParty} loses the general election`,`${state.primeMinister} wins ${playerSeats} seats, short of the 321 needed to form a government.`);
      saveLocal(false);render();toast('Election defeat');
    }
  }

  function formOpeningCabinet(){
    const inputs=[...document.querySelectorAll('[data-cabinet-name]')];
    if(inputs.some(x=>!x.value.trim())){toast('Name every Cabinet minister');return;}
    state.cabinet=inputs.map((input,i)=>{const name=input.value.trim();return{id:i+1,name,role:CABINET_ROLES[i],competence:Math.round(r(61,91)),loyalty:Math.round(r(60,93)),profile:name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()};});
    state.phase='government';state.week=1;state.date=isoAddDays(state.date,1);state.pmqsUsed=false;state.nextPMQsWeek=2;state.cabinetMeetingUsed=false;state.pmqsHistory=[];state.cabinetMeetingHistory=[];
    state.relations={unitedStates:58,europe:55,monarchy:72};state.weeklyEvent=null;state.weeklyEventHistory=[];state.calendar={speeches:[]};
    ensureWeeklyEvent();
    addNews('Government',`${state.primeMinister} begins premiership`,`The new Prime Minister enters office after appointing a full Cabinet following the general election victory.`);
    saveLocal(false);saveCloud();currentView='dashboard';render();toast('Your premiership begins');
  }

  const viewMeta = {
    dashboard:['PRIME MINISTER\'S OFFICE','Government overview'],calendar:['DOWNING HOUSE DIARY','Prime Minister’s calendar'],parliament:['THE CHAMBER','Parliament'],legislation:['LEGISLATIVE PROGRAMME','Legislation'],economy:['HM TREASURY','Economy & budget'],cabinet:['DOWNING HOUSE','Cabinet'],cabinetmeetings:['CABINET ROOM','Cabinet Meetings'],pmqs:['HOUSE OF REPRESENTATIVES','Prime Minister’s Questions'],elections:['ELECTORAL COMMISSION','Elections & polling'],transitions:['THE CONSTITUTION','Government transitions'],media:['NATIONAL PRESS','Media monitor'],crises:['COBRA ROOM','National crises']
  };

  function setView(v){
    if(!inGovernment()){toast('Win the election and form your Cabinet first');return;}
    currentView=v;
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
    $('#viewEyebrow').textContent=viewMeta[v][0];$('#viewTitle').textContent=viewMeta[v][1];
    render();
  }

  function updateChrome(){
    syncPartyRegistry();
    const d=new Date(state.date+'T12:00:00');
    $('#dateLabel').textContent=d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const pollingPhase=['campaign','election','defeat'].includes(state.phase);
    $('#approvalTop').textContent=pollingPhase?`${fmt(state.polls?.[state.governmentParty]||0,1)}%`:`${fmt(state.approval,0)}%`;
    const approvalLabel=document.querySelector('.approval-pill small');if(approvalLabel)approvalLabel.textContent=pollingPhase?'Polling':'Popularity';
    const pre=!inGovernment();document.querySelectorAll('#nav button').forEach(b=>b.disabled=pre);
    const next=$('#nextWeekBtn');next.classList.remove('hidden');
    if(state.phase==='setup'){next.classList.add('hidden');$('#viewEyebrow').textContent='ELECTION HQ';$('#viewTitle').textContent='Create your party';$('#brandSub').textContent='Avalon • Election HQ';}
    else if(state.phase==='campaign'){next.textContent=`Finish Campaign Week ${state.openingCampaign.week} →`;$('#viewEyebrow').textContent='GENERAL ELECTION';$('#viewTitle').textContent=`Campaign Week ${state.openingCampaign.week} of 2`;$('#brandSub').textContent=`${state.partyProfile.shortName} • Campaign HQ`;}
    else if(state.phase==='election'){next.textContent='Count the votes →';$('#viewEyebrow').textContent='ELECTION NIGHT';$('#viewTitle').textContent='General Election';$('#brandSub').textContent=`${state.partyProfile.shortName} • Election Night`;}
    else if(state.phase==='defeat'){next.classList.add('hidden');$('#viewEyebrow').textContent='ELECTION RESULT';$('#viewTitle').textContent='Campaign defeated';$('#brandSub').textContent=`${state.partyProfile.shortName} • Opposition`;}
    else if(state.phase==='cabinet_setup'){next.classList.add('hidden');$('#viewEyebrow').textContent='GOVERNMENT FORMATION';$('#viewTitle').textContent='Appoint your Cabinet';$('#brandSub').textContent=`${state.partyProfile.shortName} • Government formation`;}
    else {next.textContent='Advance week →';$('#viewEyebrow').textContent=viewMeta[currentView][0];$('#viewTitle').textContent=viewMeta[currentView][1];$('#brandSub').textContent=`${state.country} • ${state.governmentParty}`;}
  }

  function render(){
    updateChrome();
    if(!inGovernment()){content.innerHTML=renderPregame();bindViewEvents();return;}
    const renderers={dashboard:renderDashboard,calendar:renderCalendar,parliament:renderParliament,legislation:renderLegislation,economy:renderEconomy,cabinet:renderCabinet,cabinetmeetings:renderCabinetMeetings,pmqs:renderPMQs,elections:renderElections,transitions:renderTransitions,media:renderMedia,crises:renderCrises};
    content.innerHTML=renderers[currentView]();
    bindViewEvents();
  }

  function metric(title,value,delta,sub=''){
    const cls=delta===0?'neutral':delta>0?'good':'bad';
    return `<div class="metric-card"><div class="metric-head"><span>${title}</span><span>●</span></div><div class="metric-value">${value}</div><div class="delta ${cls}">${signed(delta)} ${sub}</div></div>`;
  }

  function renderDashboard(){
    ensureWeeklyEvent();
    const activeBills=state.bills.filter(b=>b.stage<5).length;
    const crisisText=state.crises.length?`${state.crises.length} active`:'No active crisis';
    const nextPMQDate=isoAddDays(state.date,Math.max(0,(state.nextPMQsWeek-state.week)*7));
    const due=state.week===state.nextPMQsWeek;
    return `
      <div class="hero">
        <div><div class="tag gold">WEEK ${state.week} • ${escapeHtml(state.partyProfile?.shortName||'GOV')} GOVERNMENT</div><h1>Prime Minister ${escapeHtml(state.primeMinister)}.</h1><p>Your diary now matters. Diplomatic meetings, public appearances, Cabinet business and parliamentary pressure arrive week by week.</p><div class="flex gap"><button class="primary" data-jump="calendar">Open Prime Minister’s diary</button><button class="secondary" data-jump="${due?'pmqs':'cabinetmeetings'}">${due?'Prepare for PMQs':'Open Cabinet Room'}</button></div></div>
        <div class="hero-side"><div class="hero-stat"><span>Political capital</span><strong>${fmt(state.politicalCapital,0)} / 100</strong></div><div class="hero-stat"><span>Working majority</span><strong>${state.majority}</strong></div><div class="hero-stat"><span>Next PMQs</span><strong>${due?'THIS WEEK':prettyDate(nextPMQDate)}</strong></div><div class="hero-stat"><span>Situation room</span><strong>${crisisText}</strong></div></div>
      </div>
      <div class="popularity-panel section-space">
        <div class="panel-title-row"><div><div class="eyebrow">PRIME MINISTER POPULARITY</div><h3>How the country feels about you</h3></div><strong class="popularity-number">${fmt(state.approval,1)}%</strong></div>
        <div class="popularity-scale"><div class="popularity-fill" style="width:${clamp(state.approval,0,100)}%"></div><i style="left:${clamp(state.approval,0,100)}%"></i></div>
        <div class="popularity-labels"><span>Deeply unpopular</span><span>Divided</span><span>Very popular</span></div>
      </div>
      ${renderWeeklyAgendaCard()}
      <div class="grid grid-4 section-space">
        ${metric('GDP growth',`${fmt(state.stats.gdpGrowth,2)}%`,state.stats.gdpGrowth-1.7,'annual')}
        ${metric('Inflation',`${fmt(state.stats.inflation,2)}%`,2-state.stats.inflation,'vs target')}
        ${metric('Budget deficit',`£${fmt(state.stats.deficit,0)}bn`,104-state.stats.deficit,'vs opening')}
        ${metric('NHS waiting time',`${fmt(state.stats.nhsWait,1)} wks`,17.2-state.stats.nhsWait,'vs opening')}
      </div>
      <div class="grid grid-2 section-space">
        <div class="panel"><div class="panel-title-row"><h3>Government health</h3><span class="tag ${state.approval>=50?'green':'red'}">${state.approval>=50?'Stable':'Under pressure'}</span></div>
          ${bar('Public approval',state.approval)}${bar('Political capital',state.politicalCapital)}${bar('Cabinet unity',avg(state.cabinet.map(x=>x.loyalty)))}
          <div class="divider"></div><div class="flex between small"><span class="muted">US relationship</span><b>${fmt(state.relations.unitedStates,0)} / 100</b></div><div class="flex between small section-space"><span class="muted">European relationship</span><b>${fmt(state.relations.europe,0)} / 100</b></div><div class="flex between small section-space"><span class="muted">Bills in Parliament</span><b>${activeBills}</b></div>
        </div>
        <div class="panel"><div class="panel-title-row"><h3>Latest intelligence</h3><button class="ghost" data-jump="media">All media</button></div><div class="feed">${state.media.slice(-4).reverse().map(feedItem).join('')}</div></div>
      </div>`;
  }

  function bar(label,v){return `<div class="range-row"><label>${label}</label><div class="progress ${v>=60?'good':v<40?'bad':''}"><span style="width:${clamp(v,0,100)}%"></span></div><output>${fmt(v,0)}%</output></div>`;}
  function avg(a){return a.reduce((x,y)=>x+y,0)/Math.max(a.length,1)}

  const weeklyEventTemplates=[
    {icon:'🇺🇸',title:'Bilateral meeting with the US President',location:'Downing House • State Dining Room',brief:'The US President wants a joint statement on security, trade and technology. Your words will shape the relationship.',relation:'unitedStates',choices:[
      {label:'“We work together where our interests align.”',approval:.5,capital:1,relation:4,gdp:.03,outcome:'The meeting ends with a measured joint statement and warmer working relations.'},
      {label:'“Avalon is ready for a deeper strategic partnership.”',approval:.2,capital:-1,relation:8,gdp:.06,outcome:'The President welcomes a much closer partnership, while some domestic critics question the commitments.'},
      {label:'“Avalon must keep complete freedom of action.”',approval:.4,capital:2,relation:-6,gdp:-.02,outcome:'The message plays strongly with some voters but produces a cooler diplomatic atmosphere.'}
    ]},
    {icon:'♔',title:'Weekly audience with the Monarch',location:'Royal Palace',brief:'The Head of State asks how stable the government is and what you intend to prioritise next.',relation:'monarchy',choices:[
      {label:'Give a calm, private briefing',approval:.1,capital:1,relation:4,outcome:'The audience is discreet and constructive.'},
      {label:'Emphasise the Government’s mandate',approval:.3,capital:2,relation:1,outcome:'You project confidence and authority while keeping the audience constitutional.'},
      {label:'Admit the week has been difficult',approval:.2,capital:-1,relation:3,outcome:'The candid audience is well received inside the Palace, though it reflects a bruising week.'}
    ]},
    {icon:'🏥',title:'Visit a major NHS hospital',location:'Northbridge University Hospital',brief:'Staff and patients want to hear what your government will do about waiting times and workforce pressure.',choices:[
      {label:'Promise a delivery plan with dates',approval:1.0,capital:-1,nhs:-.15,outcome:'The visit lands well, but the press now expects measurable progress.'},
      {label:'Thank staff and avoid new promises',approval:.2,capital:1,outcome:'The visit is warm but produces few new headlines.'},
      {label:'Announce emergency funding',approval:1.3,capital:-2,cost:2.4,nhs:-.3,outcome:'Emergency funding wins praise from staff and patients but reduces Treasury headroom.'}
    ]},
    {icon:'🌍',title:'European leaders’ summit',location:'Aster Conference Centre',brief:'Leaders are negotiating a new trade and energy cooperation package. Avalon must decide how closely to participate.',relation:'europe',choices:[
      {label:'Back a broad cooperation package',approval:.3,capital:-1,relation:7,gdp:.08,outcome:'Avalon joins the package and relations with European partners improve.'},
      {label:'Support trade, reject political commitments',approval:.5,capital:1,relation:3,gdp:.04,outcome:'A narrower agreement preserves flexibility while keeping trade talks moving.'},
      {label:'Walk away from the package',approval:.1,capital:2,relation:-7,gdp:-.08,outcome:'The decision wins some domestic praise but creates new friction abroad.'}
    ]},
    {icon:'🛡️',title:'National security briefing',location:'COBRA Room',brief:'Intelligence chiefs warn of growing cyber threats to transport, hospitals and government systems.',choices:[
      {label:'Fund a national cyber resilience programme',approval:.7,capital:1,cost:1.6,outcome:'A new resilience programme reassures public services and security officials.'},
      {label:'Order departments to strengthen systems within existing budgets',approval:.2,capital:2,outcome:'Departments get a firm instruction without new money, creating a tougher delivery challenge.'},
      {label:'Keep the response classified and limited',approval:-.5,capital:1,outcome:'The restrained approach avoids immediate spending but draws criticism after details leak.'}
    ]},
    {icon:'🏭',title:'Business and industry roundtable',location:'Downing House • Cabinet Room',brief:'Major employers want certainty on tax, investment and infrastructure.',choices:[
      {label:'Promise long-term policy stability',approval:.4,capital:1,gdp:.07,outcome:'Business leaders welcome the predictability and investment sentiment improves.'},
      {label:'Push firms to raise wages and investment',approval:.7,capital:1,gdp:.03,outcome:'The tougher message is popular with workers, though executives leave with mixed feelings.'},
      {label:'Offer a targeted investment incentive',approval:.3,capital:0,cost:1.2,gdp:.12,outcome:'The incentive boosts confidence but uses some fiscal headroom.'}
    ]},
    {icon:'🚆',title:'Regional transport visit',location:'West Avalon Rail Hub',brief:'Mayors are demanding faster rail upgrades and lower local fares.',choices:[
      {label:'Accelerate the rail programme',approval:1.0,capital:-1,cost:2.0,gdp:.05,outcome:'Regional leaders welcome the faster programme and commuters get a clear timetable.'},
      {label:'Prioritise bus fares first',approval:.8,capital:1,cost:.8,outcome:'The cheaper measure wins quick public support while rail upgrades stay on the longer schedule.'},
      {label:'Demand local co-funding',approval:-.1,capital:2,outcome:'Treasury exposure falls, but several mayors accuse the Government of passing the bill locally.'}
    ]},
    {icon:'🔬',title:'National science and space programme launch',location:'Avalon Space & Science Centre',brief:'Scientists want a decade-long research commitment covering space, medicine and clean technology.',choices:[
      {label:'Launch the full ten-year programme',approval:.8,capital:0,cost:1.8,gdp:.09,outcome:'The ambitious programme creates a strong innovation headline and long-term investment optimism.'},
      {label:'Start with a smaller pilot',approval:.4,capital:1,cost:.6,gdp:.04,outcome:'The pilot keeps costs controlled while giving the sector a clear first step.'},
      {label:'Delay until the next Budget',approval:-.4,capital:1,outcome:'Fiscal caution wins Treasury support but disappoints the science community.'}
    ]}
  ];

  function ensureWeeklyEvent(){
    if(!inGovernment())return;
    state.weeklyEventHistory=state.weeklyEventHistory||[];
    if(state.weeklyEvent&&state.weeklyEvent.week===state.week)return;
    const t=weeklyEventTemplates[(state.week-1)%weeklyEventTemplates.length];
    state.weeklyEvent={week:state.week,id:`week-${state.week}`,icon:t.icon,title:t.title,location:t.location,brief:t.brief,relation:t.relation||null,choices:t.choices,resolved:false,outcome:null};
  }

  function renderWeeklyAgendaCard(){
    ensureWeeklyEvent();const e=state.weeklyEvent;
    return `<div class="weekly-brief section-space"><div class="weekly-icon">${e.icon}</div><div class="weekly-copy"><div class="eyebrow">WEEK ${state.week} • PRIME MINISTER'S DIARY</div><h3>${escapeHtml(e.title)}</h3><span>${escapeHtml(e.location)}</span><p>${escapeHtml(e.brief)}</p></div><div class="weekly-action">${e.resolved?`<span class="tag green">COMPLETED</span><small>${escapeHtml(e.outcome||'Meeting completed.')}</small>`:`<button class="primary" id="handleWeeklyEvent">Attend & choose what to say →</button>`}</div></div>`;
  }

  function openWeeklyEvent(){
    ensureWeeklyEvent();const e=state.weeklyEvent;if(e.resolved){toast('This week’s major engagement is complete');return;}
    openModal(`<div class="eyebrow">PRIME MINISTER'S DIARY • WEEK ${state.week}</div><h2>${e.icon} ${escapeHtml(e.title)}</h2><p class="muted">${escapeHtml(e.brief)}</p><div class="event-choice-grid section-space">${e.choices.map((c,i)=>`<button class="event-choice" data-weekly-choice="${i}"><b>${escapeHtml(c.label)}</b><span>${i===0?'Measured response':i===1?'Stronger commitment':'Alternative approach'}</span></button>`).join('')}</div>`);
    document.querySelectorAll('[data-weekly-choice]').forEach(b=>b.onclick=()=>resolveWeeklyEvent(+b.dataset.weeklyChoice));
  }

  function resolveWeeklyEvent(i){
    const e=state.weeklyEvent;if(!e||e.resolved)return;const c=e.choices[i];if(!c)return;
    state.approval=clamp(state.approval+(c.approval||0)+r(-.2,.2),0,100);
    state.politicalCapital=clamp(state.politicalCapital+(c.capital||0),0,100);
    if(c.cost)state.treasury=clamp(state.treasury-c.cost,0,100);
    if(c.gdp)state.stats.gdpGrowth=clamp(state.stats.gdpGrowth+c.gdp,-5,8);
    if(c.nhs)state.stats.nhsWait=clamp(state.stats.nhsWait+c.nhs,3,40);
    if(e.relation&&c.relation)state.relations[e.relation]=clamp(state.relations[e.relation]+c.relation,0,100);
    e.resolved=true;e.outcome=c.outcome;e.choice=c.label;
    state.weeklyEventHistory.push({week:state.week,date:state.date,title:e.title,choice:c.label,outcome:c.outcome});
    addNews('Government',e.title,c.outcome);closeModal();saveLocal(false);render();toast('Diary engagement completed');
  }

  function popularityWord(){
    if(state.approval<25)return 'Deeply unpopular';
    if(state.approval<40)return 'Unpopular';
    if(state.approval<55)return 'Divided';
    if(state.approval<70)return 'Popular';
    return 'Very popular';
  }

  function renderCalendar(){
    ensureWeeklyEvent();
    const speeches=(state.calendar?.speeches||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const maxDate=isoAddDays(state.date,70);
    const diaryDays=[];
    for(let n=0;n<42;n++){
      const date=isoAddDays(state.date,n);
      const weekOffset=Math.floor(n/7),futureWeek=state.week+weekOffset;
      const items=[];
      if(n%7===0){
        const planned=n===0&&state.weeklyEvent?state.weeklyEvent:weeklyEventTemplates[(futureWeek-1)%weeklyEventTemplates.length];
        items.push({type:'brief',label:planned.title});
        items.push({type:'cabinet',label:'Cabinet meeting'});
      }
      if(n%7===0&&futureWeek>=state.nextPMQsWeek&&(futureWeek-state.nextPMQsWeek)%2===0)items.push({type:'pmqs',label:'PMQs'});
      speeches.filter(x=>x.date===date&&x.status==='scheduled').forEach(x=>items.push({type:'speech',label:`No. 10: ${x.topic}`}));
      diaryDays.push({date,items});
    }
    return `<div class="diary-hero"><div><span class="phase-chip">DOWNING HOUSE • OFFICIAL DIARY</span><h1>Your six-week government calendar</h1><p>PMQs appears automatically every two government weeks. Cabinet meets weekly. You decide when to step outside Number 10 and address the country.</p></div><div class="diary-date"><small>Today</small><b>${prettyDate(state.date)}</b><span>${popularityWord()} • ${fmt(state.approval,1)}%</span></div></div>
      <div class="grid grid-2 section-space"><div class="panel"><div class="panel-title-row"><div><h3>Schedule a Number 10 speech</h3><div class="muted small">Choose any date in the next ten weeks. The speech will be delivered automatically when that date passes in the simulation.</div></div><span class="tag blue-tag">YOUR CHOICE</span></div>
      <div class="form-grid roomy-form"><div class="field"><label>Speech date</label><input type="date" id="speechDate" min="${state.date}" max="${maxDate}" value="${isoAddDays(state.date,7)}"></div><div class="field"><label>Topic</label><select id="speechTopic"><option>Cost of living</option><option>NHS and public services</option><option>Economy and growth</option><option>National security</option><option>Government programme</option><option>National address</option></select></div><div class="field"><label>Tone</label><select id="speechTone"><option>Reassuring</option><option>Bold</option><option>Detailed</option></select></div></div><button class="primary full section-space" id="scheduleSpeechBtn">Schedule speech outside Number 10 →</button></div>
      <div class="panel"><div class="panel-title-row"><h3>Scheduled Number 10 speeches</h3><span class="tag">${speeches.filter(x=>x.status==='scheduled').length} upcoming</span></div>${speeches.length?`<div class="speech-list">${speeches.slice(-8).reverse().map(x=>`<div class="speech-row ${x.status}"><div><b>${prettyDate(x.date)}</b><span>${escapeHtml(x.topic)} • ${escapeHtml(x.tone)}</span></div><em>${x.status==='delivered'?'Delivered':'Scheduled'}</em></div>`).join('')}</div>`:'<div class="empty">No speeches scheduled yet. The lectern is waiting outside Number 10.</div>'}</div></div>
      <div class="panel section-space"><div class="panel-title-row"><div><h3>Six-week diary</h3><div class="muted small">Blue = diary engagement • Purple = PMQs • Gold = Cabinet • Cyan = Number 10 speech</div></div><span class="tag">42 DAYS</span></div><div class="calendar-grid">${diaryDays.map((d,i)=>`<div class="calendar-day ${i===0?'today':''}"><time>${new Date(d.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</time>${d.items.length?d.items.map(x=>`<span class="calendar-event ${x.type}">${escapeHtml(x.label)}</span>`).join(''):'<small>Open diary</small>'}</div>`).join('')}</div></div>`;
  }

  function scheduleSpeech(){
    const date=$('#speechDate')?.value,topic=$('#speechTopic')?.value,tone=$('#speechTone')?.value;
    if(!date||date<state.date){toast('Choose today or a future date');return;}
    if(date>isoAddDays(state.date,70)){toast('Choose a date within the next ten weeks');return;}
    state.calendar=state.calendar||{speeches:[]};
    if(state.calendar.speeches.some(x=>x.date===date&&x.status==='scheduled')){toast('You already have a Number 10 speech on that date');return;}
    const speech={id:Date.now(),date,topic,tone,status:'scheduled'};
    state.calendar.speeches.push(speech);addNews('Government','Number 10 speech added to the Prime Minister’s diary',`${state.primeMinister} will address the country outside Number 10 on ${prettyDate(date)} about ${topic.toLowerCase()}.`);
    if(date===state.date)deliverSpeech(speech);
    saveLocal(false);render();toast('Number 10 speech scheduled');
  }

  function deliverSpeech(speech){
    if(!speech||speech.status!=='scheduled')return;
    let swing=0,capital=0;
    if(speech.tone==='Reassuring'){swing=r(.2,1.1);capital=0;}
    if(speech.tone==='Bold'){swing=r(-.6,1.6);capital=1;}
    if(speech.tone==='Detailed'){swing=r(-.2,1.25);capital=1;}
    if(speech.topic==='Economy and growth'&&state.stats.gdpGrowth<1)swing-=.4;
    if(speech.topic==='NHS and public services'&&state.stats.nhsWait>20)swing-=.35;
    state.approval=clamp(state.approval+swing,0,100);state.politicalCapital=clamp(state.politicalCapital+capital,0,100);
    speech.status='delivered';speech.effect=swing;speech.deliveredWeek=state.week;
    addNews('Government',`${state.primeMinister} speaks outside Number 10`,`${speech.tone} remarks on ${speech.topic.toLowerCase()} move Prime Ministerial popularity by ${signed(swing,'%')}.`);
  }

  function processScheduledSpeeches(fromDate,toDate){
    (state.calendar?.speeches||[]).filter(x=>x.status==='scheduled'&&x.date>fromDate&&x.date<=toDate).forEach(deliverSpeech);
  }
  function feedItem(n){return `<div class="feed-item"><div class="feed-icon">${n.type==='Crisis'?'⚠':n.type==='Economy'?'£':'▤'}</div><div><b>${n.headline}</b><p>${n.body}</p></div><time>W${n.week}</time></div>`;}

  function renderParliament(){
    const total=Object.values(state.seats).reduce((a,b)=>a+b,0);
    const gov=state.seats[state.governmentParty];
    const majority=Math.max(0,gov-(Math.floor(total/2)+1));
    state.majority=majority;
    return `<div class="grid grid-2"><div class="parliament-wrap"><div class="panel-title-row"><div><div class="eyebrow">${total} MEMBERS</div><h3 style="margin:0">House of Representatives</h3></div><span class="tag gold">Majority line ${Math.floor(total/2)+1}</span></div><div id="seatStage" class="seat-stage"><div class="speaker-desk">THE SPEAKER</div></div><div class="legend">${partyOrder.map(p=>`<span class="legend-item"><i class="legend-dot" style="background:${PARTY_COLORS[p]}"></i>${p}</span>`).join('')}</div></div>
      <div class="panel"><div class="panel-title-row"><h3>Composition</h3><span class="tag green">Government ${gov}</span></div><div class="seat-summary">${partyOrder.map(p=>`<div class="party-row"><div><i style="background:${PARTY_COLORS[p]}"></i><b>${p}</b></div><span>${state.seats[p]}</span></div>`).join('')}</div><div class="divider"></div><div class="callout">You need <b>${Math.floor(total/2)+1}</b> votes for a simple majority. Party loyalty, bill popularity and national events all affect whether government MPs obey the whip.</div><div class="section-space"><button class="primary" data-jump="legislation">Bring legislation to the House</button></div></div></div>`;
  }

  function drawSeats(){
    const el=$('#seatStage'); if(!el) return;
    el.querySelectorAll('.seat').forEach(x=>x.remove());
    const rect=el.getBoundingClientRect(); const cx=rect.width/2, cy=rect.height-22;
    const total=640; const seats=[];
    partyOrder.forEach(p=>{for(let i=0;i<state.seats[p];i++)seats.push(p)});
    let idx=0;
    const rings=[82,108,134,160,186,212,238,264];
    const counts=[40,54,66,78,88,96,104,114];
    rings.forEach((rad,ri)=>{
      const count=counts[ri];
      for(let j=0;j<count && idx<total;j++,idx++){
        const angle=Math.PI+(Math.PI*(j/(count-1)));
        const x=cx+Math.cos(angle)*rad; const y=cy+Math.sin(angle)*rad*.72;
        const s=document.createElement('i');s.className='seat';s.style.left=`${x-5}px`;s.style.top=`${y-5}px`;s.style.background=PARTY_COLORS[seats[idx]];s.title=seats[idx];el.appendChild(s);
      }
    });
  }

  function renderLegislation(){
    return `<div class="panel"><div class="panel-title-row"><div><h3>Your legislative programme</h3><div class="muted small">Move bills through readings, committee and the final vote.</div></div><button class="primary" id="draftBillBtn">+ Draft new bill</button></div><div class="bill-grid">${state.bills.map(billCard).join('')}</div></div>`;
  }

  function billCard(b){
    const complete=b.stage>=5;
    return `<div class="bill-card"><div class="flex between center"><span class="tag">${b.category}</span><span class="bill-status">${complete?'LAW':billStages[b.stage]}</span></div><h4>${escapeHtml(b.title)}</h4><p>${escapeHtml(b.description)}</p><div class="timeline">${billStages.map((_,i)=>`<i class="${i<=b.stage?'done':''}"></i>`).join('')}</div><div class="bill-meta"><span>Expected support <b>${fmt(b.support,0)}%</b></span><span>Cost <b>${money(b.cost)}</b></span></div><div class="bill-actions">${complete?'<button class="secondary" disabled>Enacted</button>':`<button class="secondary" data-bill-details="${b.id}">Details</button><button class="primary" data-advance-bill="${b.id}">${b.stage===4?'Hold final vote':'Advance stage'}</button>`}</div></div>`;
  }

  function draftBillModal(){
    openModal(`<div class="eyebrow">LEGISLATIVE DRAFTER</div><h2>Draft a new bill</h2><div class="form-grid"><div class="field"><label>Bill title</label><input id="newBillTitle" placeholder="e.g. National Housing Bill"></div><div class="field"><label>Department</label><select id="newBillCat"><option>Economy</option><option>Health</option><option>Education</option><option>Transport</option><option>Justice</option><option>Environment</option><option>Constitution</option></select></div><div class="field" style="grid-column:1/-1"><label>Purpose</label><textarea id="newBillDesc" placeholder="Describe what the law changes..."></textarea></div><div class="field"><label>Estimated cost (£bn)</label><input id="newBillCost" type="number" min="0" max="100" value="2"></div><div class="field"><label>Starting public support (%)</label><input id="newBillSupport" type="number" min="10" max="90" value="50"></div></div><div class="section-space right"><button class="primary" id="createBillNow">Add to programme</button></div>`);
    $('#createBillNow').onclick=()=>{
      const title=$('#newBillTitle').value.trim(),desc=$('#newBillDesc').value.trim(); if(!title||!desc){toast('Add a title and purpose');return}
      state.bills.push({id:Date.now(),title,category:$('#newBillCat').value,description:desc,stage:0,support:clamp(+$('#newBillSupport').value,10,90),cost:Math.max(0,+$('#newBillCost').value),impact:{approval:r(-.5,1.5),deficit:+$('#newBillCost').value*.8}});
      state.politicalCapital=clamp(state.politicalCapital-2,0,100);closeModal();saveLocal(false);render();toast('Bill added to the King’s Speech programme');
    };
  }

  function advanceBill(id){
    const b=state.bills.find(x=>x.id==id); if(!b) return;
    if(b.stage<4){
      const friction=r(-5,4); b.support=clamp(b.support+friction,15,90); b.stage++; state.politicalCapital=clamp(state.politicalCapital-1.5,0,100);
      addNews('Parliament',`${b.title} advances to ${billStages[b.stage]}`,`Government whips report expected support at ${fmt(b.support,0)}%.`);toast(`Bill advanced: ${billStages[b.stage]}`);
    } else {
      const loyalty=avg(state.cabinet.map(x=>x.loyalty)); const gov=state.seats[state.governmentParty];
      const govYes=Math.round(gov*clamp(.72+(b.support-50)/150+(loyalty-65)/250,.52,.99));
      const oppSeats=640-gov; const oppYes=Math.round(oppSeats*clamp((b.support-45)/110,.03,.55)); const yes=govYes+oppYes; const no=640-yes;
      if(yes>320){ b.stage=5; state.approval=clamp(state.approval+(b.impact.approval||1),0,100); state.stats.deficit+=b.impact.deficit||b.cost*.75; if(b.impact.inflation)state.stats.inflation+=b.impact.inflation; state.treasury=Math.max(0,state.treasury-b.cost); addNews('Government',`${b.title} passes ${yes}–${no}`,`The bill receives assent and becomes law after a decisive Commons vote.`);openModal(`<div class="eyebrow">DIVISION RESULT</div><h2>${escapeHtml(b.title)}</h2><div class="grid grid-2"><div class="metric-card"><div class="metric-head">AYES</div><div class="metric-value" style="color:var(--good)">${yes}</div></div><div class="metric-card"><div class="metric-head">NOES</div><div class="metric-value" style="color:var(--bad)">${no}</div></div></div><p class="muted">The Ayes have it. The bill will receive assent and enter the statute book.</p>`); }
      else { b.support=clamp(b.support-7,0,100); state.approval=clamp(state.approval-3.2,0,100); state.politicalCapital=clamp(state.politicalCapital-10,0,100); addNews('Parliament',`Government defeated on ${b.title}`,`The bill falls by ${no-yes} votes, triggering questions about the Prime Minister’s authority.`); openModal(`<div class="eyebrow">GOVERNMENT DEFEAT</div><h2>${yes} Ayes • ${no} Noes</h2><p class="muted">The bill has been defeated. Your political capital and approval have taken a hit.</p>`); }
    }
    saveLocal(false);render();
  }

  function renderEconomy(){
    const b=state.budget;
    return `<div class="grid grid-4">${metric('Treasury headroom',money(state.treasury),state.treasury-38.4,'bn')}${metric('National debt',`£${fmt(state.stats.debt/1000,2)}tn`,2680-state.stats.debt,'bn improvement')}${metric('Wage growth',`${fmt(state.stats.wageGrowth,2)}%`,state.stats.wageGrowth-2.4)}${metric('Unemployment',`${fmt(state.stats.unemployment,1)}%`,4.7-state.stats.unemployment)}</div>
      <div class="grid grid-2 section-space"><div class="panel"><div class="panel-title-row"><h3>Tax policy</h3><span class="tag">Live forecast</span></div>${range('Income tax basic rate','incomeTax',b.incomeTax,10,35,'%')}${range('Corporation tax','corporationTax',b.corporationTax,10,35,'%')}<div class="section-space"><button class="primary" id="deliverBudget">Deliver Budget</button></div></div><div class="panel"><h3>Departmental spending</h3>${range('Health','health',b.health,120,260,'bn')}${range('Education','education',b.education,70,180,'bn')}${range('Defence','defence',b.defence,35,110,'bn')}${range('Welfare','welfare',b.welfare,80,220,'bn')}${range('Infrastructure','infrastructure',b.infrastructure,20,130,'bn')}</div></div>`;
  }
  function range(label,key,val,min,max,suffix){return `<div class="range-row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="1" value="${val}" data-budget="${key}"><output id="out-${key}">${val}${suffix==='bn'?'bn':suffix}</output></div>`;}
  function deliverBudget(){
    const b=state.budget; const spend=(b.health-182)+(b.education-112)+(b.defence-62)+(b.welfare-136)+(b.infrastructure-54);
    const taxEffect=(b.incomeTax-20)*5.4+(b.corporationTax-25)*2.3;
    const deficitChange=spend*.75-taxEffect;
    state.stats.deficit=clamp(state.stats.deficit+deficitChange,0,300);
    state.stats.gdpGrowth=clamp(state.stats.gdpGrowth + (b.infrastructure-54)/220 - (b.incomeTax-20)/50 - (b.corporationTax-25)/80,-4,7);
    state.stats.nhsWait=clamp(state.stats.nhsWait-(b.health-182)/36,5,30);
    state.approval=clamp(state.approval+(b.health-182)/65+(b.education-112)/80-(b.incomeTax-20)*.65,5,95);
    state.politicalCapital=clamp(state.politicalCapital-4,0,100);
    addNews('Economy','Chancellor delivers the Government Budget',`The fiscal package changes the projected deficit to £${fmt(state.stats.deficit,0)}bn and GDP growth to ${fmt(state.stats.gdpGrowth,2)}%.`);
    saveLocal(false);render();toast('Budget delivered to Parliament');
  }

  function renderCabinet(){
    return `<div class="panel"><div class="panel-title-row"><div><h3>${state.constitutional?.monarch==='Queen'?'Her Majesty’s':'His Majesty’s'} Government</h3><div class="muted small">Competence affects policy delivery. Loyalty affects rebellions and leadership stability.</div></div><span class="tag ${avg(state.cabinet.map(x=>x.loyalty))>65?'green':'red'}">Unity ${fmt(avg(state.cabinet.map(x=>x.loyalty)),0)}%</span></div><div class="minister-grid">${state.cabinet.map(m=>`<div class="minister-card"><div class="minister-top"><div class="minister-avatar">${m.profile}</div><div><h4>${m.name}</h4><small>${m.role}</small></div></div>${miniStat('Competence',m.competence)}${miniStat('Loyalty',m.loyalty)}<div class="minister-actions"><button class="secondary" data-praise="${m.id}">Praise</button><button class="ghost danger" data-sack="${m.id}">Dismiss</button></div></div>`).join('')}</div></div>`;
  }
  function renderCabinetMeetings(){
    const unity=avg(state.cabinet.map(x=>x.loyalty));
    const agenda=[
      ['Economy & Budget',`Growth ${fmt(state.stats.gdpGrowth,2)}% • Inflation ${fmt(state.stats.inflation,2)}% • Deficit £${fmt(state.stats.deficit,0)}bn`],
      ['Public Services',`NHS waiting time ${fmt(state.stats.nhsWait,1)} weeks • Education budget £${fmt(state.budget.education,0)}bn`],
      [state.crises.length?'National Crisis':'Legislative Programme',state.crises.length?`${state.crises.length} active crisis${state.crises.length===1?'':'es'} require collective agreement`:`${state.bills.filter(b=>b.stage<5).length} government bills are moving through Parliament`]
    ];
    const history=(state.cabinetMeetingHistory||[]).slice(-6).reverse();
    return `<div class="cabinet-room-hero"><div><span class="phase-chip">WEEK ${state.week} • CABINET ROOM</span><h1>The Cabinet Table</h1><p>Bring your senior ministers together, settle the week's priorities and decide how tightly you want to control the government machine.</p></div><div class="cabinet-roundel"><b>${fmt(unity,0)}%</b><small>Cabinet unity</small></div></div>
    <div class="grid grid-2 section-space"><div class="panel"><div class="panel-title-row"><div><h3>This week's agenda</h3><div class="muted small">A Cabinet meeting can be held once each government week.</div></div><span class="tag ${state.cabinetMeetingUsed?'green':'blue-tag'}">${state.cabinetMeetingUsed?'Meeting held':'Meeting available'}</span></div><div class="agenda-stack">${agenda.map((a,i)=>`<div class="agenda-item"><span>0${i+1}</span><div><b>${a[0]}</b><small>${a[1]}</small></div></div>`).join('')}</div><button class="primary big-primary full section-space" id="conveneCabinet" ${state.cabinetMeetingUsed?'disabled':''}>${state.cabinetMeetingUsed?'Cabinet has met this week':'Convene Cabinet Meeting →'}</button></div>
    <div class="panel"><div class="panel-title-row"><h3>Meeting record</h3><span class="tag">Collective government</span></div>${history.length?`<div class="meeting-history">${history.map(h=>`<div class="meeting-record"><div><b>Week ${h.week} • ${h.style}</b><small>${prettyDate(h.date)}</small></div><p>${h.outcome}</p></div>`).join('')}</div>`:'<div class="empty">No Cabinet meetings recorded yet. The table is suspiciously tidy.</div>'}</div></div>`;
  }

  function openCabinetMeeting(){
    if(state.cabinetMeetingUsed){toast('Cabinet has already met this week');return;}
    const urgent=state.crises.length?`There ${state.crises.length===1?'is':'are'} ${state.crises.length} active national ${state.crises.length===1?'crisis':'crises'} on the agenda.`:`The legislative programme and public services dominate the agenda.`;
    openModal(`<div class="eyebrow">CABINET MEETING • WEEK ${state.week}</div><h2>How will you chair the meeting?</h2><p class="muted">${urgent} Your chairing style changes ministerial loyalty, political capital and sometimes public reaction.</p><div class="meeting-choice-grid section-space"><button class="meeting-choice" data-meeting-style="Consensus"><b>🤝 Build consensus</b><span>Hear every minister, seek agreement and protect Cabinet unity.</span></button><button class="meeting-choice" data-meeting-style="Directive"><b>📌 Give firm direction</b><span>Set the line yourself and demand collective discipline.</span></button><button class="meeting-choice" data-meeting-style="Delegated"><b>🗂️ Minister-led session</b><span>Let departmental experts lead and focus on delivery.</span></button></div>`);
    document.querySelectorAll('[data-meeting-style]').forEach(b=>b.onclick=()=>resolveCabinetMeeting(b.dataset.meetingStyle));
  }

  function resolveCabinetMeeting(style){
    let loyalty=0,capital=0,approval=0,outcome='';
    if(style==='Consensus'){loyalty=r(2.5,5.5);capital=r(.2,1.3);approval=r(0,.4);outcome='Ministers left with a shared line and noticeably stronger collective unity.';}
    if(style==='Directive'){loyalty=r(-2.8,1.2);capital=r(2.0,4.0);approval=r(-.2,.6);outcome='The Prime Minister imposed a clear line. Delivery is faster, though a few ministers left bruised.';}
    if(style==='Delegated'){const comp=avg(state.cabinet.map(x=>x.competence));loyalty=r(.4,2.3);capital=r(.5,2.2);approval=(comp-70)/45+r(-.15,.35);outcome='Departmental ministers took ownership of delivery and agreed a practical action list.';}
    state.cabinet.forEach(m=>m.loyalty=clamp(m.loyalty+loyalty+r(-.7,.7),0,100));state.politicalCapital=clamp(state.politicalCapital+capital,0,100);state.approval=clamp(state.approval+approval,0,100);state.cabinetMeetingUsed=true;
    state.cabinetMeetingHistory.push({week:state.week,date:state.date,style,outcome});
    addNews('Government',`Cabinet agrees the Government's Week ${state.week} priorities`,outcome);closeModal();saveLocal(false);render();toast(`${style} Cabinet meeting completed`);
  }

  function miniStat(l,v){return `<div class="stat-line"><span>${l}</span><div class="progress ${v>70?'good':v<45?'bad':''}"><span style="width:${v}%"></span></div><b>${v}</b></div>`;}
  function praiseMinister(id){const m=state.cabinet.find(x=>x.id==id);if(!m)return;m.loyalty=clamp(m.loyalty+5,0,100);state.politicalCapital=clamp(state.politicalCapital-1,0,100);toast(`${m.name}'s loyalty increased`);saveLocal(false);render();}
  function sackMinister(id){const m=state.cabinet.find(x=>x.id==id);if(!m)return;const replacements=['Alex Mercer','Sofia Hale','Marcus Bell','Noah Bennett','Grace Rowan','Maya Clarke'];const newName=replacements[Math.floor(Math.random()*replacements.length)];m.name=newName;m.profile=newName.split(' ').map(x=>x[0]).join('');m.competence=Math.round(r(55,88));m.loyalty=Math.round(r(58,92));state.approval=clamp(state.approval-r(.3,1.2),0,100);state.politicalCapital=clamp(state.politicalCapital-3,0,100);addNews('Government',`${newName} appointed ${m.role}`,`A cabinet reshuffle changes the face of the government.`);saveLocal(false);render();toast('Cabinet reshuffled');}

  const pmqQuestions=[
    ['Cost of living','Families are paying more every month. Why should anyone believe your Government has a plan?'],
    ['NHS','Waiting lists remain far too long. When will patients actually see the improvement you promised?'],
    ['Economy','Growth is weak and the deficit is high. Is this not simply economic mismanagement?'],
    ['Standards','Will the Prime Minister admit that their own backbenchers no longer trust this government?']
  ];
  function renderPMQs(){
    const due=state.week===state.nextPMQsWeek;
    const completed=due&&state.pmqsUsed;
    const nextDate=isoAddDays(state.date,Math.max(0,(state.nextPMQsWeek-state.week)*7));
    const status=completed?'Completed this session':due?'PMQs THIS WEEK':`Next PMQs ${prettyDate(nextDate)}`;
    return `<div class="pmqs-stage"><div class="dispatch-box"><div class="eyebrow">PRIME MINISTER</div><h3>Government Dispatch Box</h3><p class="small muted">PMQs now takes place every two government weeks. When it is due, choose an opposition question and decide how you respond.</p><div class="hero-stat"><span>Current popularity</span><strong>${fmt(state.approval,1)}%</strong></div><div class="hero-stat"><span>Authority</span><strong>${fmt(state.politicalCapital,0)} / 100</strong></div></div><div class="vs">PMQs</div><div class="dispatch-box opposition"><div class="eyebrow" style="color:#ff9da3">LEADER OF THE OPPOSITION</div><h3>Opposition Dispatch Box</h3><div class="question-list">${pmqQuestions.map((q,i)=>`<button class="question-btn" data-question="${i}" ${(!due||completed)?'disabled':''}><b>${q[0]}</b><br>${q[1]}</button>`).join('')}</div></div></div>
    <div class="panel section-space"><div class="panel-title-row"><h3>PMQs timetable</h3><span class="tag ${completed?'green':due?'red':'blue-tag'}">${status}</span></div><p class="muted small">${completed?`You have completed PMQs for Week ${state.week}. The next session will be in Week ${state.nextPMQsWeek}.`:due?'The House is waiting. Complete PMQs before advancing if you want to avoid the political cost of missing the session.':`No PMQs this week. The next scheduled session is Week ${state.nextPMQsWeek}, ${prettyDate(nextDate)}.`}</p>${(state.pmqsHistory||[]).length?`<div class="pmqs-history section-space">${state.pmqsHistory.slice(-6).reverse().map(h=>`<div><b>Week ${h.week} • ${h.topic}</b><span>${h.style} answer • ${signed(h.swing,'%')}</span></div>`).join('')}</div>`:''}</div>`;
  }
  function askPMQ(i){
    if(state.week!==state.nextPMQsWeek){toast(`PMQs is next scheduled for Week ${state.nextPMQsWeek}`);return;}
    if(state.pmqsUsed){toast('PMQs already completed this session');return}const q=pmqQuestions[i];
    openModal(`<div class="eyebrow">PRIME MINISTER'S QUESTIONS • WEEK ${state.week}</div><h2>${q[0]}</h2><p class="muted">“${q[1]}”</p><div class="response-choice"><button class="secondary" data-answer="policy"><b>Policy answer</b><br><span class="muted small">Use facts, measures and a promise of delivery.</span></button><button class="secondary" data-answer="attack"><b>Attack the opposition</b><br><span class="muted small">Turn the question back on their record.</span></button><button class="secondary" data-answer="empathy"><b>Empathetic answer</b><br><span class="muted small">Acknowledge pressure and focus on affected families.</span></button></div>`);
    document.querySelectorAll('[data-answer]').forEach(btn=>btn.onclick=()=>resolvePMQ(btn.dataset.answer,q[0]));
  }
  function resolvePMQ(style,topic){
    let swing=0;if(style==='policy')swing=r(-.2,1.7)+(state.politicalCapital>55?.4:0);if(style==='attack')swing=r(-1.4,1.5);if(style==='empathy')swing=r(.1,1.3);
    state.approval=clamp(state.approval+swing,0,100);state.politicalCapital=clamp(state.politicalCapital+(swing>0?1:-2),0,100);state.pmqsUsed=true;
    state.pmqsHistory=state.pmqsHistory||[];state.pmqsHistory.push({week:state.week,date:state.date,topic,style,swing});
    state.nextPMQsWeek=state.week+2;
    addNews('Parliament',swing>=0.4?`Prime Minister lands strong answer on ${topic}`:`Opposition scores points at PMQs`,`Westminster reaction suggests a ${swing>=0?'positive':'difficult'} session for the Government. The next PMQs is scheduled in two government weeks.`);
    closeModal();saveLocal(false);render();toast(`PMQs reaction ${signed(swing,'%')}`);
  }

  function renderElections(){
    return `<div class="grid grid-2"><div class="panel"><div class="panel-title-row"><h3>National voting intention</h3><span class="tag">Election in ${state.nextElectionWeeks} weeks</span></div><div class="poll-chart">${partyOrder.map(p=>`<div class="poll-row"><label>${p}</label><div class="poll-track"><span style="width:${state.polls[p]*2.2}%;background:${PARTY_COLORS[p]}"></span></div><b>${fmt(state.polls[p],1)}%</b></div>`).join('')}</div><div class="divider"></div><button class="secondary" id="commissionPoll">Commission private poll • £0.4bn</button></div><div class="panel"><h3>Campaign operations</h3><p class="small muted">Spend campaign funds for a short-term polling lift. Repeated tactics have diminishing returns.</p><div class="campaign-actions"><button class="campaign-action" data-campaign="rally"><b>National rally</b><span>Cost £1.2bn • energise base</span></button><button class="campaign-action" data-campaign="broadcast"><b>Prime-time broadcast</b><span>Cost £0.8bn • reach swing voters</span></button><button class="campaign-action" data-campaign="ground"><b>Ground campaign</b><span>Cost £1.6bn • target marginal seats</span></button></div><div class="divider"></div><div class="flex between small"><span class="muted">Campaign fund</span><b>${money(state.campaignFunds)}</b></div>${state.nextElectionWeeks<=0?'<button class="primary full section-space" id="holdElection">HOLD GENERAL ELECTION</button>':''}</div></div>`;
  }
  function campaign(type){
    const cfg={rally:[1.2,.45],broadcast:[.8,.35],ground:[1.6,.6]}[type];if(state.campaignFunds<cfg[0]){toast('Not enough campaign funds');return}state.campaignFunds-=cfg[0];const lift=r(.1,cfg[1]);movePoll(state.governmentParty,lift);state.approval=clamp(state.approval+lift*.35,0,100);saveLocal(false);render();toast(`Campaign lift +${fmt(lift,1)} pts`);
  }
  function movePoll(p,lift){state.polls[p]+=lift;const others=partyOrder.filter(x=>x!==p);others.forEach(x=>state.polls[x]-=lift/others.length);normalizePolls();}
  function normalizePolls(){const total=partyOrder.reduce((a,p)=>a+state.polls[p],0);partyOrder.forEach(p=>state.polls[p]=Math.max(.5,state.polls[p]*100/total));}
  function holdElection(){
    const raw={}; let sum=0; partyOrder.forEach(p=>{raw[p]=Math.max(1,state.polls[p]**2.15);sum+=raw[p]}); let allocated=0;const newSeats={};partyOrder.forEach((p,i)=>{newSeats[p]=i===partyOrder.length-1?640-allocated:Math.round(raw[p]/sum*640);allocated+=newSeats[p]});state.seats=newSeats;const govSeats=newSeats[state.governmentParty];state.electionHeld=true;state.nextElectionWeeks=208;state.approval=clamp(state.approval+r(-2,2),0,100);const won=govSeats>=321;addNews('Election',won?`${state.governmentParty} wins the general election`:`Government loses its majority`,`The new Parliament returns ${govSeats} seats for the governing party.`);saveLocal(false);render();openModal(`<div class="eyebrow">GENERAL ELECTION RESULT</div><h2>${won?'Victory':'No overall government majority'}</h2><p class="muted">${state.governmentParty}: <b>${govSeats}</b> seats out of 640.</p><div class="seat-summary">${partyOrder.map(p=>`<div class="party-row"><div><i style="background:${PARTY_COLORS[p]}"></i><b>${p}</b></div><span>${newSeats[p]}</span></div>`).join('')}</div>`);
  }

  function renderTransitions(){
    ensureConstitutional();
    const c=state.constitutional;
    const snap=c.snapElection;
    const res=c.resignation;
    const royal=`${c.monarch==='Queen'?'Her Majesty':'His Majesty'} The ${c.monarch}`;
    const snapLocked=!!res && !res.completed;
    const resLocked=!!snap && !snap.completed;
    const snapTimeline=snap?constitutionalTimeline([
      ['Seek your Cabinet',snap.cabinetDate,snap.cabinetDone],
      [`Meet with ${monarchLabel()}`,snap.royalDate,snap.royalDone],
      ['Announce the snap election',snap.announcementDate,snap.announcementDone],
      ['General election polling day',snap.electionDate,snap.completed]
    ]):'';
    const resTimeline=res?constitutionalTimeline([
      ['Announce resignation',res.announcementDate,res.announcementDone],
      ['Make the resignation timetable',res.timetableMadeDate,res.timetableMade],
      ['Announce the timetable',res.timetableAnnouncementDate,res.timetableAnnounced],
      [`Final day: meet with ${monarchLabel()} and resign`,res.finalDay,res.completed]
    ]):'';
    return `
      <div class="grid grid-2">
        <div class="panel royal-panel"><div class="panel-title-row"><div><div class="eyebrow">ROYAL HOUSEHOLD</div><h3>${royal}</h3></div><span class="tag gold">Head of State</span></div><p class="small muted">Choose whether Avalon currently has a King or Queen. Constitutional action wording changes throughout the game.</p><div class="field section-space"><label>Monarch</label><select id="monarchSelect" ${snap||res?'disabled':''}><option ${c.monarch==='King'?'selected':''}>King</option><option ${c.monarch==='Queen'?'selected':''}>Queen</option></select></div>${snap||res?'<div class="callout">The monarch cannot be changed while a constitutional process is active.</div>':''}</div>
        <div class="panel"><div class="eyebrow">CURRENT DATE</div><h3>${prettyDate(state.date)}</h3><p class="small muted">Stages unlock when their scheduled date arrives. Advance the government calendar to reach future appointments.</p>${c.governmentEnded?'<div class="callout danger-callout"><b>Your premiership has ended.</b><br>The final royal resignation has taken place.</div>':'<div class="callout">Constitutional actions are deliberately sequential. You cannot jump straight to an election announcement or final resignation.</div>'}</div>
      </div>
      <div class="grid grid-2 section-space">
        <div class="panel constitutional-card"><div class="panel-title-row"><div><div class="eyebrow">SNAP GENERAL ELECTION</div><h3>Request an early election</h3></div><span class="tag ${snap?'gold':''}">${snap?snap.status.replaceAll('_',' '):'Not started'}</span></div><p class="small muted">Required route: seek Cabinet → royal audience → public announcement → polling day.</p>${snap?snapTimeline:`<button class="primary full section-space" id="startSnapElection" ${snapLocked||c.governmentEnded?'disabled':''}>BEGIN SNAP ELECTION PROCESS</button>`}${snap?snapActionButton(snap):''}${snapLocked?'<div class="callout section-space">Finish or cancel the resignation process before seeking a snap election.</div>':''}</div>
        <div class="panel constitutional-card"><div class="panel-title-row"><div><div class="eyebrow">RESIGNATION</div><h3>Leave office formally</h3></div><span class="tag ${res?'red':''}">${res?res.status.replaceAll('_',' '):'Not started'}</span></div><p class="small muted">Required route: announce resignation → make timetable → announce timetable → final-day royal audience and resignation.</p>${res?resTimeline:`<button class="danger-button full section-space" id="startResignation" ${resLocked||c.governmentEnded?'disabled':''}>ANNOUNCE RESIGNATION</button>`}${res?resignationActionButton(res):''}${resLocked?'<div class="callout section-space">A snap-election process is already active.</div>':''}</div>
      </div>`;
  }

  function constitutionalTimeline(items){return `<div class="constitution-timeline">${items.map(([label,date,done],i)=>`<div class="constitution-step ${done?'done':(date&&reached(date)?'ready':'')}" ><div class="step-marker">${done?'✓':i+1}</div><div><b>${label}</b><span>${prettyDate(date)}</span></div><em>${done?'Completed':date?(reached(date)?'Ready':'Scheduled'):'Pending'}</em></div>`).join('')}</div>`;}

  function snapActionButton(snap){
    if(snap.completed)return '<div class="callout section-space"><b>Election process complete.</b> The election has been held and Parliament has been updated.</div>';
    if(!snap.cabinetDone)return `<button class="primary full section-space" id="snapCabinet" ${reached(snap.cabinetDate)?'':'disabled'}>SEEK YOUR CABINET</button>`;
    if(!snap.royalDone)return `<button class="primary full section-space" id="snapRoyal" ${reached(snap.royalDate)?'':'disabled'}>MEET WITH ${monarchLabel().toUpperCase()}</button>`;
    if(!snap.announcementDone)return `<button class="primary full section-space" id="snapAnnounce" ${reached(snap.announcementDate)?'':'disabled'}>ANNOUNCE SNAP ELECTION</button>`;
    const days=Math.max(0,dateDiffDays(state.date,snap.electionDate));
    if(!reached(snap.electionDate))return `<div class="callout section-space">Parliament is in election mode. Polling day is <b>${prettyDate(snap.electionDate)}</b> (${days} day${days===1?'':'s'} away).</div>`;
    return '<button class="primary full section-space" id="snapPoll">HOLD GENERAL ELECTION</button>';
  }

  function resignationActionButton(res){
    if(res.completed)return '<div class="callout section-space"><b>Resignation completed.</b> Your final audience with the monarch has taken place.</div>';
    if(!res.announcementDone)return '';
    if(!res.timetableMade)return '<button class="secondary full section-space" id="makeResignationTimetable">MAKE RESIGNATION TIMETABLE</button>';
    if(!res.timetableAnnounced)return '<button class="primary full section-space" id="announceResignationTimetable">ANNOUNCE THE TIMETABLE</button>';
    if(!reached(res.finalDay)){const days=Math.max(0,dateDiffDays(state.date,res.finalDay));return `<div class="callout section-space">Final day: <b>${prettyDate(res.finalDay)}</b>. The royal resignation meeting unlocks in ${days} day${days===1?'':'s'}.</div>`;}
    return `<button class="danger-button full section-space" id="finalResignation">MEET WITH ${monarchLabel().toUpperCase()} & RESIGN</button>`;
  }

  function startSnapElection(){
    ensureConstitutional(); if(state.constitutional.resignation&&!state.constitutional.resignation.completed)return;
    state.constitutional.snapElection={status:'cabinet_consultation',startedDate:state.date,cabinetDate:state.date,cabinetDone:false,royalDate:null,royalDone:false,announcementDate:null,announcementDone:false,electionDate:null,completed:false};
    addNews('Government','Prime Minister begins snap-election consultations','Cabinet ministers have been summoned to discuss whether the country should be asked for a fresh mandate.');saveLocal(false);render();toast('Cabinet consultation opened');
  }
  function seekCabinet(){
    const x=state.constitutional.snapElection;if(!x||x.cabinetDone)return;x.cabinetDone=true;x.status='royal_audience_scheduled';x.royalDate=isoAddDays(state.date,7);state.politicalCapital=clamp(state.politicalCapital+(avg(state.cabinet.map(m=>m.loyalty))>65?1:-2),0,100);addNews('Cabinet','Cabinet consulted on snap election',`Ministers have been formally consulted. A royal audience is scheduled for ${prettyDate(x.royalDate)}.`);saveLocal(false);render();toast('Cabinet consulted');
  }
  function meetMonarchForElection(){
    const x=state.constitutional.snapElection;if(!x||x.royalDone||!reached(x.royalDate))return;x.royalDone=true;x.status='announcement_scheduled';x.announcementDate=isoAddDays(state.date,7);addNews('Constitution',`Prime Minister meets ${state.constitutional.monarch}`,`The Prime Minister has formally sought a dissolution. A public announcement is scheduled for ${prettyDate(x.announcementDate)}.`);saveLocal(false);render();toast('Royal audience completed');
  }
  function announceSnapElection(){
    const x=state.constitutional.snapElection;if(!x||x.announcementDone||!reached(x.announcementDate))return;x.announcementDone=true;x.status='campaign';x.electionDate=isoAddDays(state.date,42);state.nextElectionWeeks=Math.ceil(dateDiffDays(state.date,x.electionDate)/7);addNews('Election','Prime Minister calls a snap general election',`The country will vote on ${prettyDate(x.electionDate)} after the Prime Minister completed Cabinet and royal consultations.`);saveLocal(false);render();openModal(`<div class="eyebrow">DOWNING HOUSE</div><h2>Snap election announced</h2><p class="muted">Polling day has been set for <b>${prettyDate(x.electionDate)}</b>.</p><div class="constitution-mini"><span>Cabinet ✓</span><span>Royal audience ✓</span><span>Announcement ✓</span></div>`);
  }
  function holdSnapElection(){const x=state.constitutional.snapElection;if(!x||!reached(x.electionDate))return;x.completed=true;x.status='completed';holdElection();saveLocal(false);}

  function startResignation(){
    ensureConstitutional();if(state.constitutional.snapElection&&!state.constitutional.snapElection.completed)return;
    state.constitutional.resignation={status:'announced',announcementDate:state.date,announcementDone:true,timetableMadeDate:null,timetableMade:false,timetableAnnouncementDate:null,timetableAnnounced:false,finalDay:null,completed:false};
    state.approval=clamp(state.approval-1.2,0,100);addNews('Government','Prime Minister announces resignation','The Prime Minister has announced an intention to leave office. A formal resignation timetable will now be prepared.');saveLocal(false);render();toast('Resignation announced');
  }
  function openResignationTimetable(){
    const min=isoAddDays(state.date,14);const suggested=isoAddDays(state.date,28);
    openModal(`<div class="eyebrow">RESIGNATION TIMETABLE</div><h2>Set your final day in office</h2><p class="muted">Choose the date on which you will make your final visit to the monarch and formally resign.</p><div class="field section-space"><label>Final day</label><input type="date" id="resignationFinalDate" min="${min}" value="${suggested}"></div><div class="callout section-space">The timetable announcement will happen after you confirm this schedule. Your final royal meeting remains locked until the chosen date.</div><button class="primary full section-space" id="confirmResignationTimetable">CONFIRM TIMETABLE</button>`);
    $('#confirmResignationTimetable').onclick=()=>{const val=$('#resignationFinalDate').value;if(!val||dateDiffDays(state.date,val)<14||dateDiffDays(state.date,val)%7!==0){toast('Choose a final day at least 14 days away on a game-week date');return}const r=state.constitutional.resignation;r.timetableMade=true;r.timetableMadeDate=state.date;r.finalDay=val;r.status='timetable_prepared';closeModal();addNews('Government','Resignation timetable prepared',`The Prime Minister has fixed ${prettyDate(val)} as the planned final day in office.`);saveLocal(false);render();toast('Timetable prepared');};
  }
  function announceResignationTimetable(){const r=state.constitutional.resignation;if(!r||!r.timetableMade||r.timetableAnnounced)return;r.timetableAnnounced=true;r.timetableAnnouncementDate=state.date;r.status='handover';addNews('Government','Prime Minister publishes resignation timetable',`The timetable has been announced publicly. The Prime Minister's final day will be ${prettyDate(r.finalDay)}.`);saveLocal(false);render();openModal(`<div class="eyebrow">OFFICIAL TIMETABLE</div><h2>Resignation timetable announced</h2><div class="constitution-timeline"><div class="constitution-step done"><div class="step-marker">✓</div><div><b>Resignation announced</b><span>${prettyDate(r.announcementDate)}</span></div></div><div class="constitution-step done"><div class="step-marker">✓</div><div><b>Timetable published</b><span>${prettyDate(r.timetableAnnouncementDate)}</span></div></div><div class="constitution-step"><div class="step-marker">3</div><div><b>Final royal audience</b><span>${prettyDate(r.finalDay)}</span></div></div></div>`);}
  function completeResignation(){const r=state.constitutional.resignation;if(!r||r.completed||!reached(r.finalDay))return;r.completed=true;r.status='completed';state.constitutional.governmentEnded=true;addNews('Government',`Prime Minister formally resigns to ${state.constitutional.monarch}`,`On ${prettyDate(state.date)}, the Prime Minister met ${monarchLabel()} and formally resigned from office.`);saveLocal(false);render();openModal(`<div class="eyebrow">FINAL AUDIENCE</div><h2>Your premiership has ended</h2><p class="muted">You met with ${monarchLabel()} on <b>${prettyDate(state.date)}</b> and formally resigned as Prime Minister.</p><div class="callout section-space">Your government record remains available to review.</div>`);}

  function renderMedia(){
    const lead=state.media[state.media.length-1]; const rest=state.media.slice(0,-1).reverse();
    return `<div class="news-layout"><div class="headline-card"><span class="tag gold">${lead.type.toUpperCase()} • WEEK ${lead.week}</span><h3>${lead.headline}</h3><p>${lead.body}</p></div><div class="grid">${rest.slice(0,6).map(n=>`<div class="news-card"><span class="tag">${n.type}</span><h4>${n.headline}</h4><p>${n.body}</p></div>`).join('')}</div></div>`;
  }

  function renderCrises(){
    return `<div class="grid grid-2"><div class="panel"><div class="panel-title-row"><h3>Active situations</h3><span class="tag ${state.crises.length?'red':'green'}">${state.crises.length?state.crises.length+' active':'All clear'}</span></div><div class="crisis-list">${state.crises.length?state.crises.map(crisisCard).join(''):'<div class="empty">No active national emergency. Enjoy the silence while it lasts.</div>'}</div></div><div class="panel"><h3>Resolved situations</h3><div class="crisis-list">${state.resolvedCrises.length?state.resolvedCrises.slice(-5).reverse().map(c=>`<div class="crisis-card resolved"><h4>${c.title}</h4><p>${c.outcome}</p><span class="tag green">Resolved week ${c.resolvedWeek}</span></div>`).join(''):'<div class="empty">No resolved crises yet.</div>'}</div></div></div>`;
  }
  function crisisCard(c){return `<div class="crisis-card"><div class="crisis-top"><div><h4>${c.title}</h4><p>${c.description}</p></div><span class="tag red">Severity ${c.severity}/5</span></div><div class="crisis-options">${c.options.map((o,i)=>`<button class="secondary" data-crisis="${c.id}" data-option="${i}">${o.label}</button>`).join('')}</div></div>`;}
  function resolveCrisis(id,opt){const c=state.crises.find(x=>x.id==id);if(!c)return;const o=c.options[opt];state.approval=clamp(state.approval+o.approval,0,100);state.politicalCapital=clamp(state.politicalCapital+o.capital,0,100);state.stats.deficit=Math.max(0,state.stats.deficit+(o.cost||0));c.outcome=o.outcome;c.resolvedWeek=state.week;state.resolvedCrises.push(c);state.crises=state.crises.filter(x=>x.id!=id);addNews('Crisis',`${c.title}: government announces response`,o.outcome);saveLocal(false);render();toast('Crisis response enacted');}

  const crisisTemplates=[
    {title:'Nationwide rail disruption',description:'A rolling transport strike has paralysed major commuter routes and freight corridors.',severity:3,options:[{label:'Emergency talks',approval:1.0,capital:-2,cost:.4,outcome:'Ministers brokered emergency talks and a temporary service agreement.'},{label:'Minimum service order',approval:-.4,capital:1,cost:0,outcome:'The Government imposed minimum service rules, easing disruption but inflaming unions.'},{label:'Subsidise settlement',approval:.5,capital:-1,cost:2.2,outcome:'Treasury funding secured a rapid pay settlement and restored services.'}]},
    {title:'Severe winter energy squeeze',description:'Cold weather and wholesale shortages are pushing household energy prices sharply upward.',severity:4,options:[{label:'Household rebate',approval:2.1,capital:0,cost:5.5,outcome:'A temporary household rebate softened the immediate price shock.'},{label:'Targeted support',approval:1.1,capital:1,cost:2.4,outcome:'Support was concentrated on low-income households and essential services.'},{label:'Market intervention',approval:.2,capital:-3,cost:1.5,outcome:'Government price intervention steadied bills but unsettled energy investors.'}]},
    {title:'Major hospital cyberattack',description:'Several regional hospital systems have lost access to scheduling and patient administration systems.',severity:5,options:[{label:'Activate cyber command',approval:1.4,capital:1,cost:1.0,outcome:'Cyber teams contained the attack and restored priority hospital systems.'},{label:'National emergency funding',approval:1.8,capital:-1,cost:3.1,outcome:'Emergency funding accelerated recovery and strengthened hospital cyber defences.'},{label:'Limited response',approval:-2.8,capital:-4,cost:.2,outcome:'A restrained response saved money but produced severe criticism over delayed recovery.'}]}
  ];

  function addNews(type,headline,body){state.media.push({week:state.week,type,headline,body});if(state.media.length>30)state.media.shift();}

  function advanceWeek(){
    if(state.phase==='campaign'){advanceOpeningCampaign();return;}
    if(state.phase==='election'){holdOpeningElection();return;}
    if(state.phase==='setup'){toast('Create your party to begin');return;}
    if(state.phase==='defeat'){toast('The election was lost. Start a new campaign to continue');return;}
    if(state.phase==='cabinet_setup'){toast('Form your Cabinet to begin the premiership');return;}
    ensureConstitutional();if(state.constitutional.governmentEnded){toast('Your premiership has ended');return}
    ensureWeeklyEvent();
    if(state.weeklyEvent&&!state.weeklyEvent.resolved){
      state.approval=clamp(state.approval-.7,0,100);state.politicalCapital=clamp(state.politicalCapital-1,0,100);
      state.weeklyEvent.resolved=true;state.weeklyEvent.outcome='The Prime Minister missed the engagement, creating an avoidable negative headline.';
      state.weeklyEventHistory.push({week:state.week,date:state.date,title:state.weeklyEvent.title,choice:'Missed',outcome:state.weeklyEvent.outcome});
      addNews('Government',`Prime Minister misses: ${state.weeklyEvent.title}`,state.weeklyEvent.outcome);
    }
    if(state.week===state.nextPMQsWeek&&!state.pmqsUsed){
      state.approval=clamp(state.approval-1.2,0,100);state.politicalCapital=clamp(state.politicalCapital-2,0,100);
      addNews('Parliament','Prime Minister misses scheduled PMQs','The absence dominates the political news and the Opposition accuses the Government of avoiding scrutiny.');
      state.nextPMQsWeek=state.week+2;
    }
    const oldDate=state.date,oldApproval=state.approval;
    state.week++;state.nextElectionWeeks--;
    const newDate=isoAddDays(state.date,7);
    processScheduledSpeeches(oldDate,newDate);
    state.date=newDate;state.cabinetMeetingUsed=false;
    if(state.week===state.nextPMQsWeek)state.pmqsUsed=false;

    state.stats.gdpGrowth=clamp(state.stats.gdpGrowth+r(-.09,.11),-5,8);
    state.stats.inflation=clamp(state.stats.inflation+r(-.11,.12)+(state.stats.deficit>150?.03:0),-.5,15);
    state.stats.unemployment=clamp(state.stats.unemployment+r(-.05,.06)-state.stats.gdpGrowth/500,2,14);
    state.stats.wageGrowth=clamp(state.stats.wageGrowth+r(-.07,.08),-1,10);
    state.stats.debt=Math.max(300,state.stats.debt+state.stats.deficit/52);
    state.stats.nhsWait=clamp(state.stats.nhsWait+r(-.06,.09)-(state.budget.health-182)/1200,3,40);
    state.stats.crime=clamp(state.stats.crime+r(-.4,.45),20,90);
    state.stats.migration=clamp(state.stats.migration+r(-7,8),50,1300);
    state.treasury=clamp(state.treasury+r(.25,.75)-state.stats.deficit/900,0,90);
    state.campaignFunds=clamp(state.campaignFunds+r(.05,.16),0,30);
    let swing=(state.stats.gdpGrowth-1.5)*.09-(state.stats.inflation-2)*.07-(state.stats.nhsWait-15)*.025+r(-.5,.5);
    if(state.crises.length)swing-=state.crises.length*.12;
    state.approval=clamp(state.approval+swing,4,96);state.politicalCapital=clamp(state.politicalCapital+r(-1.2,1.4)+(state.approval>55?.25:-.05),0,100);
    movePoll(state.governmentParty,(state.approval-oldApproval)*.08+r(-.12,.12));

    if(Math.random()<.20&&state.crises.length<2){const tpl=JSON.parse(JSON.stringify(crisisTemplates[Math.floor(Math.random()*crisisTemplates.length)]));tpl.id=Date.now()+Math.random();state.crises.push(tpl);addNews('Crisis',tpl.title,tpl.description);}
    if(Math.random()<.32){const snippets=[['Economy','Consumer confidence shifts',`New survey data reflects a government popularity rating of ${fmt(state.approval,0)}%.`],['Politics','Backbenchers assess the week ahead',`Whips are watching ${state.bills.filter(b=>b.stage<5).length} active government bills.`],['Public services','Fresh pressure on public services',`Average NHS waiting time is now ${fmt(state.stats.nhsWait,1)} weeks.`]];const n=snippets[Math.floor(Math.random()*snippets.length)];addNews(...n);}
    if(state.constitutional.snapElection?.announcementDone&&!state.constitutional.snapElection.completed&&state.constitutional.snapElection.electionDate){state.nextElectionWeeks=Math.max(0,Math.ceil(dateDiffDays(state.date,state.constitutional.snapElection.electionDate)/7));}
    state.weeklyEvent=null;ensureWeeklyEvent();
    state.history.push({week:state.week,date:state.date,approval:state.approval,gdp:state.stats.gdpGrowth,inflation:state.stats.inflation,deficit:state.stats.deficit});if(state.history.length>104)state.history.shift();
    saveLocal(false);saveCloud();render();toast(`Week ${state.week}: diary and government brief updated`);
  }

  function bindViewEvents(){
    $('#beginCampaignBtn')?.addEventListener('click',beginOpeningCampaign);
    document.querySelectorAll('[data-opening-campaign]').forEach(b=>b.onclick=()=>openingCampaignAction(b.dataset.openingCampaign));
    $('#countElectionBtn')?.addEventListener('click',holdOpeningElection);
    $('#formGovernmentBtn')?.addEventListener('click',formOpeningCabinet);
    $('#restartAfterDefeatBtn')?.addEventListener('click',()=>{state=initialState();cloudGameId=null;syncPartyRegistry();saveLocal(false);render();toast('New campaign ready')});
    $('#handleWeeklyEvent')?.addEventListener('click',openWeeklyEvent);
    $('#scheduleSpeechBtn')?.addEventListener('click',scheduleSpeech);
    $('#conveneCabinet')?.addEventListener('click',openCabinetMeeting);
    document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>setView(b.dataset.jump));
    document.querySelectorAll('[data-advance-bill]').forEach(b=>b.onclick=()=>advanceBill(b.dataset.advanceBill));
    document.querySelectorAll('[data-bill-details]').forEach(b=>b.onclick=()=>{const x=state.bills.find(y=>y.id==b.dataset.billDetails);openModal(`<div class="eyebrow">BILL BRIEFING</div><h2>${escapeHtml(x.title)}</h2><p class="muted">${escapeHtml(x.description)}</p><div class="grid grid-3"><div class="metric-card"><div class="metric-head">STAGE</div><div class="metric-value" style="font-size:16px">${billStages[x.stage]}</div></div><div class="metric-card"><div class="metric-head">SUPPORT</div><div class="metric-value">${fmt(x.support,0)}%</div></div><div class="metric-card"><div class="metric-head">COST</div><div class="metric-value" style="font-size:18px">${money(x.cost)}</div></div></div>`)});
    $('#draftBillBtn')?.addEventListener('click',draftBillModal);
    document.querySelectorAll('[data-budget]').forEach(rg=>rg.oninput=()=>{state.budget[rg.dataset.budget]=+rg.value;const isPct=['incomeTax','corporationTax'].includes(rg.dataset.budget);$(`#out-${rg.dataset.budget}`).textContent=rg.value+(isPct?'%':'bn');});
    $('#deliverBudget')?.addEventListener('click',deliverBudget);
    document.querySelectorAll('[data-praise]').forEach(b=>b.onclick=()=>praiseMinister(b.dataset.praise));
    document.querySelectorAll('[data-sack]').forEach(b=>b.onclick=()=>sackMinister(b.dataset.sack));
    document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>askPMQ(+b.dataset.question));
    document.querySelectorAll('[data-campaign]').forEach(b=>b.onclick=()=>campaign(b.dataset.campaign));
    $('#commissionPoll')?.addEventListener('click',()=>{if(state.treasury<.4){toast('Treasury has insufficient headroom');return}state.treasury-=.4;partyOrder.forEach(p=>state.polls[p]+=r(-.35,.35));normalizePolls();saveLocal(false);render();toast('Fresh private polling received');});
    $('#holdElection')?.addEventListener('click',holdElection);
    document.querySelectorAll('[data-crisis]').forEach(b=>b.onclick=()=>resolveCrisis(b.dataset.crisis,+b.dataset.option));
    $('#monarchSelect')?.addEventListener('change',e=>{ensureConstitutional();state.constitutional.monarch=e.target.value;saveLocal(false);render();toast(`Monarch set to ${e.target.value}`)});
    $('#startSnapElection')?.addEventListener('click',startSnapElection);
    $('#snapCabinet')?.addEventListener('click',seekCabinet);
    $('#snapRoyal')?.addEventListener('click',meetMonarchForElection);
    $('#snapAnnounce')?.addEventListener('click',announceSnapElection);
    $('#snapPoll')?.addEventListener('click',holdSnapElection);
    $('#startResignation')?.addEventListener('click',startResignation);
    $('#makeResignationTimetable')?.addEventListener('click',openResignationTimetable);
    $('#announceResignationTimetable')?.addEventListener('click',announceResignationTimetable);
    $('#finalResignation')?.addEventListener('click',completeResignation);
    if(currentView==='parliament')requestAnimationFrame(drawSeats);
  }

  $('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)setView(b.dataset.view)});
  $('#nextWeekBtn').onclick=advanceWeek;
  $('#saveBtn').onclick=()=>{saveLocal();saveCloud()};
  $('#resetBtn').onclick=()=>{openModal(`<div class="eyebrow">NEW CAMPAIGN</div><h2>Start a completely new game?</h2><p class="muted">This returns you to party creation, followed by the compulsory two-week campaign and General Election. It replaces the current save.</p><div class="flex gap section-space"><button class="primary" id="confirmReset">Start new campaign</button><button class="secondary" id="cancelReset">Keep current game</button></div>`);$('#cancelReset').onclick=closeModal;$('#confirmReset').onclick=()=>{state=initialState();cloudGameId=null;syncPartyRegistry();saveLocal(false);closeModal();currentView='dashboard';render();toast('New election campaign ready')}};
  $('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

  setTimeout(()=>{$('#boot').classList.add('hidden');$('#app').classList.remove('hidden');render();initCloud();},1100);
})();
