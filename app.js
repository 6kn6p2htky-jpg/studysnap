const $=id=>document.getElementById(id),KEY="studysnap-library-v2";let format="Fiche de révision",attachments=[],library=readLibrary(),filter="all";
function readLibrary(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return []}}function persist(){localStorage.setItem(KEY,JSON.stringify(library))}function icon(f){return {"Fiche de révision":"▤","Carte mentale":"⌘","Schéma":"⇢","Flashcards":"▣"}[f]||"▤"}function empty(t){let d=document.createElement("div");d.className="empty";d.textContent=t;return d}
function page(name){document.querySelectorAll(".page").forEach(x=>x.hidden=x.id!=="page-"+name);document.querySelectorAll(".navbtn").forEach(x=>x.classList.toggle("active",x.dataset.page===name));$("result").hidden=true;$("error").hidden=true;if(name==="library")renderLibrary();if(name==="cards")renderCards();if(name==="maps")renderMaps();window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>page(b.dataset.page));
async function addAttachments(fileList){
  const incoming=[...fileList];
  if(!incoming.length)return;
  if(attachments.length+incoming.length>10){err("Tu peux ajouter 10 fichiers maximum.");return}
  const totalNow=attachments.reduce((n,a)=>n+(a.size||0),0);
  const totalIncoming=incoming.reduce((n,f)=>n+f.size,0);
  if(totalNow+totalIncoming>4*1024*1024){err("Les fichiers sélectionnés dépassent 4 Mo au total. Choisis un PDF plus léger ou moins de fichiers.");return}
  for(const f of incoming){
    const type=(f.type||"").toLowerCase();
    const isImage=type.startsWith("image/");
    const allowed=isImage||["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/plain","text/markdown","text/csv"].includes(type)||/\.(pdf|docx|pptx|xlsx|txt|md|csv)$/i.test(f.name);
    if(!allowed){err("Format non pris en charge : "+f.name);continue}
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Impossible de lire "+f.name));r.readAsDataURL(f)});
    attachments.push({name:f.name,type:type||"application/octet-stream",data,size:f.size,isImage});
  }
  renderAttachments();
}
function renderAttachments(){
  $("previews").replaceChildren();$("fileList").replaceChildren();
  attachments.forEach(a=>{
    if(a.isImage){const im=document.createElement("img");im.src=a.data;im.alt=a.name;im.title=a.name;$("previews").append(im)}
    else{const item=document.createElement("div");item.className="file-chip";item.textContent="▤ "+a.name;$("fileList").append(item)}
  });
  $("photoCount").textContent=attachments.length?attachments.length+" fichier(s) sélectionné(s)":"Aucun document ou photo sélectionné";
}
$("photos").onchange=async e=>{await addAttachments(e.target.files);e.target.value=""};
$("documents").onchange=async e=>{await addAttachments(e.target.files);e.target.value=""};
document.querySelectorAll(".format").forEach(b=>b.onclick=()=>{format=b.dataset.format;document.querySelectorAll(".format").forEach(x=>x.classList.toggle("selected",x===b))});
function err(t){$("error").textContent=t;$("error").hidden=false}
async function analyze(correction=""){if(!attachments.length)return err("Ajoute au moins une photo ou un fichier de ton cours.");$("error").hidden=true;$("loading").hidden=false;$("generate").disabled=true;$("result").hidden=true;try{let r=await fetch("/.netlify/functions/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({attachments:attachments.map(({name,type,data})=>({name,type,data})),format,correction})}),d=await r.json();if(!r.ok)throw Error(d.error||"Erreur IA");$("resultTitle").textContent=d.title||"Tes révisions";$("resultSubtitle").textContent=format;if(d.status==="needs_clarification"){$("clarification").hidden=false;$("content").hidden=true;$("unclearText").textContent=d.unclearPassage||"Passage illisible";$("clarificationQuestion").textContent=d.clarificationQuestion||"Peux-tu confirmer ce passage ?";$("correction").value=""}else{let item={id:Date.now().toString(36)+Math.random().toString(36).slice(2),format,title:d.title||format,content:d.content||"",cards:Array.isArray(d.cards)?d.cards:[],date:new Date().toISOString()};library.unshift(item);persist();$("clarification").hidden=true;$("content").hidden=false;renderContent(item,$("content"));$("saveNotice").hidden=false}$("result").hidden=false;$("result").scrollIntoView({behavior:"smooth"})}catch(e){err(e.message)}finally{$("loading").hidden=true;$("generate").disabled=false}}
$("generate").onclick=()=>analyze();$("sendCorrection").onclick=()=>{let c=$("correction").value.trim();if(c)analyze(c);else $("correction").focus()};$("again").onclick=()=>$("result").hidden=true;
function renderContent(item,el){el.replaceChildren();if(item.format==="Flashcards"&&item.cards.length){flashViewer(item,el);return}let p=document.createElement("div");p.textContent=item.content;el.append(p)}
function flashViewer(item,el){let i=0,shown=false,box=document.createElement("div");box.className="flashcard";let front=document.createElement("div"),back=document.createElement("div"),reveal=document.createElement("button"),count=document.createElement("small"),actions=document.createElement("div");actions.className="flash-actions";let prev=document.createElement("button"),next=document.createElement("button");function draw(){let c=item.cards[i];front.className="front";front.textContent=c.front||c.question||"Question";back.className="back";back.textContent=shown?(c.back||c.answer||""):"";reveal.textContent=shown?"Masquer la réponse":"Voir la réponse";count.textContent=`Carte ${i+1} / ${item.cards.length}`;prev.disabled=i===0;next.disabled=i===item.cards.length-1}reveal.onclick=()=>{shown=!shown;draw()};prev.textContent="← Précédente";next.textContent="Suivante →";prev.onclick=()=>{i--;shown=false;draw()};next.onclick=()=>{i++;shown=false;draw()};actions.append(prev,next);box.append(front,back,reveal,count,actions);el.append(box);draw()}
function row(item){let r=document.createElement("div");r.className="library-item";let ico=document.createElement("div");ico.className="item-icon";ico.textContent=icon(item.format);let m=document.createElement("div");m.className="item-main";let t=document.createElement("strong");t.textContent=item.title;let s=document.createElement("small");s.textContent=item.format+" · "+new Date(item.date).toLocaleDateString("fr-FR");m.append(t,s);let b=document.createElement("button");b.className="item-open";b.textContent="Ouvrir";b.onclick=()=>openItem(item.id);r.append(ico,m,b);return r}
function openItem(id){let x=library.find(v=>v.id===id);if(!x)return;page("home");$("resultTitle").textContent=x.title;$("resultSubtitle").textContent=x.format;$("clarification").hidden=true;$("content").hidden=false;$("saveNotice").hidden=true;renderContent(x,$("content"));$("result").hidden=false;$("result").scrollIntoView({behavior:"smooth"})}
function renderLibrary(){let q=$("search").value.toLowerCase();$("libraryCount").textContent=library.length;let a=library.filter(x=>(filter==="all"||x.format===filter)&&(x.title+" "+x.content).toLowerCase().includes(q));$("libraryList").replaceChildren();if(!a.length)$("libraryList").append(empty(library.length?"Aucun résultat dans cette catégorie.":"Ta bibliothèque est vide. Crée ton premier support dans l'onglet Créer."));else a.forEach(x=>$("libraryList").append(row(x)))}
$("search").oninput=renderLibrary;document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderLibrary()});
function renderCards(){let a=library.filter(x=>x.format==="Flashcards");$("flashcardDecks").replaceChildren();if(!a.length)$("flashcardDecks").append(empty("Aucun paquet de flashcards. Crée-en depuis l'onglet Créer."));else a.forEach(x=>{let r=row(x);r.querySelector("small").textContent=(x.cards?.length||0)+" cartes · "+new Date(x.date).toLocaleDateString("fr-FR");$("flashcardDecks").append(r)})}
function renderMaps(){let a=library.filter(x=>["Carte mentale","Schéma"].includes(x.format));$("visualList").replaceChildren();if(!a.length)$("visualList").append(empty("Aucune carte mentale ou aucun schéma enregistré."));else a.forEach(x=>$("visualList").append(row(x)))}
renderLibrary();