/* =====================================================================
   Reports.gs — تقارير دفتر التسميع في Google Sheets
   تتحدّث تلقائيًا كل ٥ دقائق، وتعتمد على دالتين موجودتين في مشروعك:
   checkPin(pin) و teacherData(pin)
   ===================================================================== */

const RPT_SURAH="الفاتحة البقرة آل_عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس".split(" ").map(s=>s.replace("_"," "));
const RPT_SP=[1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,593,594,595,595,596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,603,603,604,604,604];
const RPT_C={ink:"#18302A",green:"#2E6B50",greenSoft:"#DCEBE2",gold:"#B5862A",goldSoft:"#F6ECD6",rose:"#B3453A",roseSoft:"#F6DFDB",muted:"#5E716A",zebra:"#F5F8F5",white:"#FFFFFF"};
const RPT_RATEC=[["#1F6B4A","#FFFFFF"],["#DCEBE2","#2E6B50"],["#DDEFF5","#1F6E8C"],["#F6ECD6","#B5862A"],["#F6DFDB","#B3453A"]];
const RPT_RATES=["مثالي","ممتاز","جيد","مقبول","يُعاد"];
const RPT_WD=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
let RPT_TZ="Asia/Riyadh";

/* ---------- تُستدعى من الصفحة ---------- */
function reportsSetup(pin,tz){
  if(!rptPinOk_(pin))return{error:"pin"};
  const P=PropertiesService.getScriptProperties();
  let id=P.getProperty("RPT_ID"),ss=null;
  if(id){try{ss=SpreadsheetApp.openById(id)}catch(e){ss=null}}
  if(!ss){ss=SpreadsheetApp.create("دفتر التسميع - التقارير");id=ss.getId()}
  P.setProperties({RPT_ID:id,RPT_PIN:String(pin),RPT_TZ:tz||Session.getScriptTimeZone(),RPT_SIG:""});
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="reportsTick").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("reportsTick").timeBased().everyMinutes(5).create();
  rptSync_(true);
  return{ok:true,url:ss.getUrl()};
}
function reportsInfo(pin){
  if(!rptPinOk_(pin))return{};
  const P=PropertiesService.getScriptProperties(),id=P.getProperty("RPT_ID");
  if(!id)return{};
  if(P.getProperty("RPT_PIN")!==String(pin))P.setProperty("RPT_PIN",String(pin)); /* إذا تغيّر الرمز */
  return{url:"https://docs.google.com/spreadsheets/d/"+id+"/edit"};
}
function reportsNow(pin){
  if(!rptPinOk_(pin))return{error:"pin"};
  const P=PropertiesService.getScriptProperties();
  if(!P.getProperty("RPT_ID"))return{error:"none"};
  P.setProperty("RPT_PIN",String(pin));
  rptSync_(true);
  return{ok:true};
}
/* المؤقت: كل ٥ دقائق، ولا يعيد الكتابة إلا إذا تغيّرت البيانات أو بدأ يوم جديد */
function reportsTick(){try{rptSync_(false)}catch(e){console.error(e)}}
/* شغّلها مرة واحدة من المحرر لمنح الصلاحيات الجديدة */
function reportsAuth(){ScriptApp.getProjectTriggers();Logger.log("تم ✓")}

/* ---------- تذكّر جهاز المعلم ----------
   بعد إدخال الرمز مرة واحدة يُعطى الجوال مفتاحًا عشوائيًا يُحفظ في عنوان الصفحة،
   فيدخل المعلم دون رمز. أقصى ١٠ أجهزة، وإذا تغيّر الرمز السري يبطل المفتاح تلقائيًا. */
function trustDevice(pin){
  if(!rptPinOk_(pin))return{error:"pin"};
  const P=PropertiesService.getScriptProperties(),T=rptTrust_();
  const keys=Object.keys(T).sort((a,b)=>T[a].at-T[b].at);
  while(keys.length>=10)delete T[keys.shift()];
  const tok=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,"");
  T[rptHash_(tok)]={pin:String(pin),at:Date.now()};
  P.setProperty("TRUST",JSON.stringify(T));
  return{ok:true,token:tok};
}
function trustedPin(token){
  token=String(token||"");if(token.length<48)return{ok:false};
  const T=rptTrust_(),h=rptHash_(token),e=T[h];
  if(!e)return{ok:false};
  if(!rptPinOk_(e.pin)){delete T[h];PropertiesService.getScriptProperties().setProperty("TRUST",JSON.stringify(T));return{ok:false}}
  return{ok:true,pin:e.pin};
}
function untrustDevice(token){
  const T=rptTrust_();delete T[rptHash_(String(token||""))];
  PropertiesService.getScriptProperties().setProperty("TRUST",JSON.stringify(T));
  return{ok:true};
}
function rptTrust_(){try{return JSON.parse(PropertiesService.getScriptProperties().getProperty("TRUST")||"{}")||{}}catch(e){return{}}}
function rptHash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>("0"+(b&255).toString(16)).slice(-2)).join("")}

function rptPinOk_(pin){try{const r=checkPin(String(pin));return!!(r&&r.ok)}catch(e){return false}}

function rptSync_(force){
  const P=PropertiesService.getScriptProperties(),id=P.getProperty("RPT_ID"),pin=P.getProperty("RPT_PIN");
  if(!id||!pin)return;
  RPT_TZ=P.getProperty("RPT_TZ")||Session.getScriptTimeZone();
  const C=CacheService.getScriptCache();
  if(C.get("RPT_RUN")&&!force)return;
  C.put("RPT_RUN","1",240);
  try{
    const d=teacherData(pin);
    if(!d||!d.records)return;
    const sig=Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      JSON.stringify([d.roster,d.records,d.lessons,d.excused]),Utilities.Charset.UTF_8))+rptDay_(Date.now());
    if(!force&&sig===P.getProperty("RPT_SIG"))return;
    rptBuild_(SpreadsheetApp.openById(id),d);
    P.setProperty("RPT_SIG",sig);
  }finally{C.remove("RPT_RUN")}
}

/* ---------- الحساب (نفس قواعد الصفحة) ---------- */
function rptDay_(t){return Utilities.formatDate(new Date(t),RPT_TZ,"yyyy-MM-dd")}
function rptDate_(d){const[y,m,dd]=d.split("-").map(Number);return new Date(Date.UTC(y,m-1,dd,12))}
function rptDayLabel_(d){
  const dt=rptDate_(d);let h="";
  try{h=dt.toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})}catch(e){}
  if(!/(محرم|صفر|ربيع|جمادى|رجب|شعبان|رمضان|شوال|القعدة|الحجة)/.test(h)){const[y,m,x]=d.split("-");h=(+x)+"/"+(+m)+"/"+y}
  return RPT_WD[dt.getUTCDay()]+"   "+h;
}
function rptDayShort_(d){const[,m,x]=d.split("-");return RPT_WD[rptDate_(d).getUTCDay()]+"\n"+(+x)+"/"+(+m)}
function rptJuzAmt_(p){
  const a=Math.min(p.from,p.to),b=Math.max(p.from,p.to),s=RPT_SP[a],e=Math.max(b<113?RPT_SP[b+1]:605,s+0.3);let t=0;
  for(let k=1;k<=30;k++){const js=k===1?1:2+20*(k-1),je=k===30?605:2+20*k,ov=Math.min(e,je)-Math.max(s,js);if(ov>0)t+=ov/(je-js)}
  return t;
}
function rptPts_(p){return(p.hes||0)+2*(p.err||0)}
function rptRate_(p){const pts=rptPts_(p),allow=Math.max(1,Math.round(6*rptJuzAmt_(p))),s=allow/6;
  if(pts===0)return 0;if(pts>allow)return 4;if(pts<=2*s)return 1;if(pts<=4*s)return 2;return 3}
function rptTier_(pts,jz){const per=pts/Math.max(jz,0.25);return pts===0?0:per<=2?1:per<=4?2:per<=6?3:4}
function rptParts_(r){return["near","far"].filter(k=>r[k]&&!r[k].skipped&&r[k].from!=null).map(k=>({r:r,k:k,p:r[k]}))}
function rptDisp_(full,roster){
  if(!full||full==="المعلم")return full;
  const cut=n=>String(n).split(/\s+/).filter(x=>x&&x!=="بن"),w=cut(full);if(w.length<=2)return w.join(" ");
  const short=w[0]+" "+w[w.length-1];
  const clash=roster.some(o=>{if(o===full)return false;const v=cut(o);return v[0]+" "+v[v.length-1]===short});
  return clash?w[0]+" "+w[1]+" "+w[w.length-1]:short;
}

/* ---------- الكتابة ---------- */
function rptSheet_(ss,name,rows,widths,freeze){
  const sh=ss.getSheetByName(name)||ss.insertSheet(name);
  const w=Math.max(widths.length,...rows.map(r=>r.length));
  sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()).breakApart();
  sh.clear();sh.setRightToLeft(true);
  if(sh.getMaxColumns()<w)sh.insertColumnsAfter(sh.getMaxColumns(),w-sh.getMaxColumns());
  if(sh.getMaxRows()<rows.length)sh.insertRowsAfter(sh.getMaxRows(),rows.length-sh.getMaxRows());
  const V=[],B=[],F=[],W=[];
  for(const r of rows){const v=[],b=[],f=[],ww=[];
    for(let i=0;i<w;i++){let c=r[i];if(c==null||typeof c!=="object")c={v:c};
      let val=c.v==null?"":c.v;if(typeof val==="string"&&/^[=+\-@]/.test(val))val="'"+val;
      v.push(val);b.push(c.bg||r.bg||null);f.push(c.fc||r.fc||RPT_C.ink);ww.push(c.b||r.b?"bold":"normal")}
    V.push(v);B.push(b);F.push(f);W.push(ww)}
  if(rows.length){
    sh.getRange(1,1,rows.length,w).setValues(V).setBackgrounds(B).setFontColors(F).setFontWeights(W)
      .setFontFamily("Arial").setFontSize(11).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    rows.forEach((r,i)=>{if(r.m)sh.getRange(i+1,1,1,w).merge().setHorizontalAlignment("right")});
    sh.getRange(1,1).setFontSize(14);
  }
  widths.forEach((x,i)=>sh.setColumnWidth(i+1,x));
  sh.setFrozenRows(Math.min(freeze||0,rows.length));
}

function rptBuild_(ss,d){
  const roster=d.roster||[],lessons=(d.lessons||[]).slice();
  const recs=(d.records||[]).slice().sort((a,b)=>a.at-b.at);recs.forEach(r=>r._d=rptDay_(r.at));
  const exc={},MAN=[];(d.excused||[]).forEach(x=>{const nm_=String(x.name);
    if(nm_.indexOf("حاضر:")===0)MAN.push({day:x.day,name:nm_.slice(5)});else exc[x.day+"|"+nm_]=1});
  const nm=n=>rptDisp_(n,roster),r1=x=>Math.round(x*10)/10;
  const stamp="آخر تحديث: "+Utilities.formatDate(new Date(),RPT_TZ,"yyyy/MM/dd   HH:mm");
  const R=(cells,st)=>Object.assign(cells.slice(),st||{});
  const title=t=>[R([t],{bg:RPT_C.green,fc:RPT_C.white,b:true,m:true}),R([stamp],{fc:RPT_C.muted,m:true})];
  const head=h=>R(h,{bg:RPT_C.ink,fc:RPT_C.white,b:true});
  const dayHead=t=>R([t],{bg:RPT_C.goldSoft,b:true,m:true});
  const lvl=t=>({v:t===4?"يحتاج مراجعة":RPT_RATES[t],bg:RPT_RATEC[t][0],fc:RPT_RATEC[t][1],b:true});
  const red=v=>({v:v,fc:v?RPT_C.rose:null,b:!!v});

  /* تجميع كل طالب في كل يوم */
  const D={},items={};
  for(const r of recs)for(const x of rptParts_(r)){
    const day=r._d;D[day]=D[day]||{};(items[day]=items[day]||[]).push(x);
    const o=D[day][r.reader]=D[day][r.reader]||{pts:0,jz:0,hes:0,err:0,c:0,redo:0};
    o.pts+=rptPts_(x.p);o.jz+=rptJuzAmt_(x.p);o.hes+=x.p.hes||0;o.err+=x.p.err||0;o.c++;if(rptRate_(x.p)===4)o.redo++;
  }
  const ranked=day=>Object.keys(D[day]).map(n=>{const o=D[day][n],per=o.pts/Math.max(o.jz,0.25);
      return Object.assign({name:n,per:per,t:rptTier_(o.pts,o.jz)},o)})
    .sort((a,b)=>a.t-b.t||a.per-b.per||b.jz-a.jz);
  const days=Object.keys(D).sort().reverse();
  const PR=new Set();recs.forEach(r=>{PR.add(r._d+"|"+r.reader);PR.add(r._d+"|"+r.listener)});lessons.forEach(l=>PR.add(l.day+"|"+l.student));MAN.forEach(x=>PR.add(x.day+"|"+x.name));
  /* الجمعة والسبت لا حلقة فيهما، فلا غياب فيهما */
  const offDay=d=>{const g=new Date(d+"T12:00:00Z").getUTCDay();return g===5||g===6};
  const hd=new Set([...recs.map(r=>r._d),...lessons.map(l=>l.day),...MAN.map(x=>x.day)].filter(d=>!offDay(d)));

  /* ١) ترتيب كل يوم */
  {const H=["الترتيب","الطالب","المستوى","ترددات لكل جزء","المقدار (جزء)","مرات التسميع","تردد","خطأ","أُعيد"];
   const rows=title("ترتيب الطلاب في كل يوم (الأفضل أولًا)");
   if(!days.length)rows.push(R(["لا يوجد تسميع بعد"],{m:true}));
   for(const day of days){
     rows.push([]);rows.push(dayHead(rptDayLabel_(day)));rows.push(head(H));
     ranked(day).forEach((s,i)=>rows.push(R([{v:i+1,b:i<3},{v:nm(s.name),b:true},lvl(s.t),r1(s.per),r1(s.jz),s.c,s.hes,red(s.err),red(s.redo)],{bg:i%2?RPT_C.zebra:null})));
     const miss=roster.filter(n=>!D[day][n]);
     if(miss.length)rows.push(R(["لم يسمّع: "+miss.map(nm).join("، ")],{fc:RPT_C.muted,m:true}));
   }
   rptSheet_(ss,"ترتيب كل يوم",rows,[70,170,110,110,100,95,60,60,60],2);}

  /* ٢) سجل التسميع: كل يوم، والطلاب حسب ترتيبهم في ذلك اليوم */
  {const H=["القارئ","النوع","السامع","من سورة","إلى سورة","المقدار (جزء)","تردد","خطأ","النتيجة"];
   const rows=title("سجل التسميع (الأحدث أولًا، والطلاب حسب الأفضل في اليوم)");rows.push(head(H));
   for(const day of days){
     const rank={};ranked(day).forEach((s,i)=>rank[s.name]=i);
     const list=items[day].sort((a,b)=>rank[a.r.reader]-rank[b.r.reader]||(a.k===b.k?a.r.at-b.r.at:(a.k==="near"?-1:1)));
     rows.push(dayHead(rptDayLabel_(day)));let A=0,Hs=0,E=0,V=0;
     list.forEach(x=>{const p=x.p,rt=rptRate_(p),a=rptJuzAmt_(p);A+=a;Hs+=p.hes||0;E+=p.err||0;if(rt===4)V++;
       rows.push([{v:nm(x.r.reader),b:true},{v:x.k==="near"?"قريبة":"بعيدة",fc:x.k==="near"?RPT_C.green:RPT_C.gold,b:true},
         x.r.listener===x.r.reader?"لنفسه":nm(x.r.listener),RPT_SURAH[p.from],RPT_SURAH[p.to],r1(a),p.hes||0,red(p.err||0),
         {v:RPT_RATES[rt],bg:RPT_RATEC[rt][0],fc:RPT_RATEC[rt][1],b:true}])});
     rows.push(R(["مجموع اليوم","","","","",r1(A),Hs,E,V?"أُعيد "+V:"—"],{bg:RPT_C.greenSoft,fc:RPT_C.green,b:true}));
   }
   rptSheet_(ss,"سجل التسميع",rows,[170,70,170,100,100,95,60,60,90],3);}

  /* ٣) ملخص الطلاب */
  {const H=["الطالب","المستوى","ترددات لكل جزء","مرات التسميع","المقدار (جزء)","تردد","خطأ","أُعيد","سمع لغيره","أيام الحضور","استأذن","دروس اجتازها","دروس أُعيدت"];
   const S=roster.map(n=>{let pts=0,jz=0,h=0,e=0,c=0,v=0;
     recs.filter(r=>r.reader===n).forEach(r=>rptParts_(r).forEach(x=>{pts+=rptPts_(x.p);jz+=rptJuzAmt_(x.p);h+=x.p.hes||0;e+=x.p.err||0;c++;if(rptRate_(x.p)===4)v++}));
     let pd=0;hd.forEach(day=>{if(PR.has(day+"|"+n))pd++});
     return{name:n,jz:jz,h:h,e:e,c:c,v:v,pd:pd,t:c?rptTier_(pts,jz):null,per:c?pts/Math.max(jz,0.25):null,
       heard:recs.filter(r=>r.listener===n&&r.reader!==n).reduce((s,r)=>s+rptParts_(r).length,0),
       ex:Object.keys(exc).filter(k=>k.endsWith("|"+n)).length,
       lp:lessons.filter(l=>l.student===n&&l.verdict!=="redo").length,lr:lessons.filter(l=>l.student===n&&l.verdict==="redo").length}});
   S.sort((a,b)=>(a.t==null?9:a.t)-(b.t==null?9:b.t)||(a.per==null?99:a.per)-(b.per==null?99:b.per)||b.jz-a.jz);
   const rows=title("ملخص الطلاب (الأعلى مستوى أولًا)");rows.push(head(H));
   S.forEach((s,i)=>rows.push(R([{v:nm(s.name),b:true},s.t==null?{v:"لم يسمّع",fc:RPT_C.muted}:lvl(s.t),s.per==null?"—":r1(s.per),s.c,r1(s.jz),s.h,red(s.e),red(s.v),s.heard,s.pd,s.ex,s.lp,red(s.lr)],{bg:i%2?RPT_C.zebra:null})));
   rows.push([]);rows.push(R(["المستوى حسب متوسط الترددات لكل جزء (الخطأ بترددين): صفر مثالي، ١–٢ ممتاز، ٣–٤ جيد، ٥–٦ مقبول، أكثر من ٦ يحتاج مراجعة."],{fc:RPT_C.muted,m:true}));
   rptSheet_(ss,"ملخص الطلاب",rows,[170,110,110,95,100,60,60,60,85,90,70,95,95],3);}

  /* ٤) الحضور: آخر ٣١ يوم حلقة */
  {const dl=[...new Set([...hd,...Object.keys(exc).map(k=>k.split("|")[0])])].filter(d=>!offDay(d)).sort().slice(-31);
   const rows=title("كشف الحضور (آخر ٣١ يوم حلقة)");rows.push(head(["الطالب",...dl.map(rptDayShort_),"حاضر","مستأذن","غائب"]));
   roster.forEach(n=>{let p=0,e=0,a=0;const cells=[{v:nm(n),b:true}];
     dl.forEach(day=>{if(PR.has(day+"|"+n)){p++;cells.push({v:"✓",bg:RPT_C.greenSoft,fc:RPT_C.green,b:true})}
       else if(exc[day+"|"+n]){e++;cells.push({v:"م",bg:RPT_C.goldSoft,fc:RPT_C.gold,b:true})}
       else{a++;cells.push({v:"غ",bg:RPT_C.roseSoft,fc:RPT_C.rose,b:true})}});
     cells.push({v:p,fc:RPT_C.green,b:true},{v:e,fc:RPT_C.gold,b:true},{v:a,fc:RPT_C.rose,b:true});rows.push(cells)});
   rows.push([]);rows.push(R(["حاضر: ✓     مستأذن: م     غائب: غ"],{fc:RPT_C.muted,m:true}));
   rptSheet_(ss,"الحضور",rows,[170,...dl.map(()=>62),60,60,60],3);}

  /* ٥) الدروس */
  {const H=["الطالب","من سورة","إلى سورة","الآيات / ملاحظة","تردد","خطأ","القرار"];
   const rows=title("دروس الطلاب");rows.push(head(H));
   const ld=[...new Set(lessons.map(l=>l.day))].sort().reverse(),ri=n=>{const i=roster.indexOf(n);return i<0?999:i};
   if(!ld.length)rows.push(R(["لا توجد دروس بعد"],{m:true}));
   ld.forEach(day=>{rows.push(dayHead(rptDayLabel_(day)));
     lessons.filter(l=>l.day===day).sort((a,b)=>ri(a.student)-ri(b.student)||a.at-b.at).forEach(l=>{const rd=l.verdict==="redo";
       rows.push([{v:nm(l.student),b:true},RPT_SURAH[l.from],RPT_SURAH[l.to==null?l.from:l.to],l.note||"",l.hes||0,red(l.err||0),
         {v:rd?"يُعاد":"اجتاز",bg:RPT_RATEC[rd?4:1][0],fc:RPT_RATEC[rd?4:1][1],b:true}])})});
   rptSheet_(ss,"الدروس",rows,[170,100,100,200,60,60,80],3);}

  /* ترتيب الأوراق وحذف الورقة الفارغة الأولى */
  const order=["ترتيب كل يوم","سجل التسميع","ملخص الطلاب","الحضور","الدروس"];
  order.forEach((n,i)=>{ss.setActiveSheet(ss.getSheetByName(n));ss.moveActiveSheet(i+1)});
  ss.getSheets().forEach(sh=>{if(order.indexOf(sh.getName())<0&&/^(Sheet|ورقة|الورقة)\s*1$/i.test(sh.getName())&&sh.getLastRow()===0)ss.deleteSheet(sh)});
}
