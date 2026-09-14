/* New3D Gestão - aplicação front-end */
const DB_KEYS = { users:'new3d_users', clients:'new3d_orders', session:'new3d_session', accessibility:'new3d_accessibility' };

async function sha256(text){
  if(globalThis.crypto?.subtle){
    const data=new TextEncoder().encode(text), hash=await crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  let h1=0x811c9dc5,h2=0x01000193;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1^=c;h1=Math.imul(h1,0x01000193);h2^=c+i;h2=Math.imul(h2,0x85ebca6b);}
  return [h1>>>0,h2>>>0,(h1^h2)>>>0,Math.imul(h1,h2)>>>0].map(n=>n.toString(16).padStart(8,'0')).join('');
}
function getDB(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(e){console.error('Erro ao ler dados:',e);return fallback}}
function setDB(key,value){localStorage.setItem(key,JSON.stringify(value))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

async function seedIfEmpty(){
  let users=getDB(DB_KEYS.users,[]);
  const defaults=[{username:'admin',role:'admin',password:'admin123'},{username:'colaborador',role:'colaborador',password:'colab123'}];
  for(const a of defaults){const hash=await sha256(a.password);const u=users.find(x=>x.username===a.username);if(!u)users.push({username:a.username,role:a.role,passwordHash:hash});else{u.role=a.role;u.passwordHash=hash}}
  setDB(DB_KEYS.users,users);
  if(!localStorage.getItem(DB_KEYS.clients)) setDB(DB_KEYS.clients,[]);
}

function setupAccessibility(){
  let settings=getDB(DB_KEYS.accessibility,{fontSize:1,contrast:false});
  const apply=()=>{document.documentElement.style.setProperty('--font-scale',settings.fontSize);document.body.classList.toggle('high-contrast',!!settings.contrast);};
  apply();
  let panel=document.getElementById('accessibility-panel');
  if(!panel)return;
  const toggle=document.getElementById('accessibility-toggle');
  toggle?.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)document.getElementById('accessibility-font-increase')?.focus()});
  document.getElementById('accessibility-close')?.addEventListener('click',()=>{panel.hidden=true;toggle?.setAttribute('aria-expanded','false')});
  document.getElementById('accessibility-font-increase')?.addEventListener('click',()=>{settings.fontSize=Math.min(1.3,Number((settings.fontSize+.1).toFixed(2)));setDB(DB_KEYS.accessibility,settings);apply()});
  document.getElementById('accessibility-font-decrease')?.addEventListener('click',()=>{settings.fontSize=Math.max(.9,Number((settings.fontSize-.1).toFixed(2)));setDB(DB_KEYS.accessibility,settings);apply()});
  document.getElementById('accessibility-font-reset')?.addEventListener('click',()=>{settings.fontSize=1;setDB(DB_KEYS.accessibility,settings);apply()});
  document.getElementById('accessibility-contrast')?.addEventListener('click',()=>{settings.contrast=!settings.contrast;setDB(DB_KEYS.accessibility,settings);apply()});
  panel.addEventListener('click',e=>{if(e.target===panel)panel.hidden=true});
}

async function initLoginPage(){
  await seedIfEmpty(); setupAccessibility();
  const form=document.getElementById('login-form'),errorEl=document.getElementById('login-error');
  document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{document.getElementById('username').value=chip.dataset.user;document.getElementById('password').value=chip.dataset.pass}));
  form.addEventListener('submit',async e=>{e.preventDefault();errorEl.textContent='';const usernameValue=document.getElementById('username').value.trim(),passwordValue=document.getElementById('password').value;const user=getDB(DB_KEYS.users,[]).find(u=>u.username===usernameValue&&u.passwordHash);if(!user||user.passwordHash!==await sha256(passwordValue)){errorEl.textContent='Usuário ou senha inválidos.';return}setDB(DB_KEYS.session,{username:user.username,role:user.role});location.href='dashboard.html'});
}

let statusChart=null;
async function initDashboardPage(){
  await seedIfEmpty();
  const session=getDB(DB_KEYS.session,null);if(!session){location.href='index.html';return}
  setupAccessibility();
  document.getElementById('user-name').textContent=session.username;document.getElementById('role-badge').textContent=session.role==='admin'?'Administrador':'Colaborador';
  if(session.role==='admin')document.querySelectorAll('.nav-admin-only').forEach(el=>el.hidden=false);
  document.getElementById('logout-btn').addEventListener('click',()=>{localStorage.removeItem(DB_KEYS.session);location.href='index.html'});
  setupNav();setupMobileMenu();setupClientsView(session);renderUsersView();renderDashboardView();
}
function setupNav(){
  const links=document.querySelectorAll('.nav-link');links.forEach(link=>link.addEventListener('click',e=>{e.preventDefault();links.forEach(l=>{l.classList.remove('active');l.removeAttribute('aria-current')});link.classList.add('active');link.setAttribute('aria-current','page');document.querySelectorAll('.view').forEach(v=>v.hidden=true);const view=document.getElementById(link.dataset.view);if(view)view.hidden=false;if(link.dataset.view==='view-dashboard')renderDashboardView();if(link.dataset.view==='view-clientes')renderClientsTable(window._new3dPermissions.canDelete,window._new3dOpenModal,window._new3dPermissions.canEdit);document.getElementById('sidebar').classList.remove('open') }));
}
function setupMobileMenu(){const t=document.getElementById('menu-toggle'),s=document.getElementById('sidebar');t.addEventListener('click',()=>{const open=s.classList.toggle('open');t.setAttribute('aria-expanded',String(open))})}
function renderDashboardView(){
  const orders=getDB(DB_KEYS.clients,[]);document.getElementById('stat-total').textContent=orders.length;document.getElementById('stat-ativos').textContent=orders.filter(o=>o.status==='Em produção').length;document.getElementById('stat-leads').textContent=orders.filter(o=>o.status==='Pedido recebido').length;document.getElementById('stat-valor').textContent=orders.filter(o=>o.status==='Pago').reduce((s,o)=>s+(Number(o.valor)||0),0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});renderStatusChart(orders);renderAlerts(orders);
}
function renderStatusChart(orders){const ctx=document.getElementById('chart-status');if(!ctx||typeof Chart==='undefined')return;if(statusChart)statusChart.destroy();const counts={'Pedido recebido':0,'Em produção':0,'Pago':0};orders.forEach(o=>counts[o.status]=(counts[o.status]||0)+1);statusChart=new Chart(ctx,{type:'bar',data:{labels:Object.keys(counts),datasets:[{label:'Pedidos',data:Object.values(counts),backgroundColor:['#B8860B','#445285','#2FA39C'],borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}})}
function renderAlerts(orders){const list=document.getElementById('alert-list');if(!list)return;list.innerHTML='';const alerts=[],now=Date.now();orders.forEach(o=>{if(o.status==='Em produção'&&now-(o.criadoEm||now)>86400000*7)alerts.push({text:`Pedido de "${o.nome}" (${o.empresa}) está em produção há mais de 7 dias.`,level:'danger'});if(o.status==='Pedido recebido'&&now-(o.criadoEm||now)>86400000*3)alerts.push({text:`Pedido de "${o.nome}" ainda não entrou em produção há mais de 3 dias.`,level:'warn'})});if(!alerts.length){const li=document.createElement('li');li.className='alert-empty';li.textContent='Nenhum alerta no momento.';list.appendChild(li);return}alerts.forEach(a=>{const li=document.createElement('li');if(a.level==='danger')li.className='alert-danger';li.textContent=a.text;list.appendChild(li)})}

function setupClientsView(session){
  const canDelete=session.role==='admin',canEdit=true;const modal=document.getElementById('client-modal'),form=document.getElementById('client-form'),modalTitle=document.getElementById('modal-title');
  function openClientModal(order){form.reset();document.getElementById('client-id').value=order?.id||'';modalTitle.textContent=order?'Editar pedido':'Novo pedido';if(order){document.getElementById('client-nome').value=order.nome||'';document.getElementById('client-empresa').value=order.empresa||'';document.getElementById('client-email').value=order.email||'';document.getElementById('client-status').value=order.status||'Pedido recebido';document.getElementById('client-valor').value=order.valor??''}modal.hidden=false;document.getElementById('client-nome').focus()}
  window._new3dOpenModal=openClientModal;window._new3dPermissions={canDelete,canEdit};
  document.getElementById('new-client-btn').addEventListener('click',()=>openClientModal());document.getElementById('quick-new-order').addEventListener('click',()=>openClientModal());document.getElementById('modal-cancel').addEventListener('click',()=>modal.hidden=true);modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true});
  form.addEventListener('submit',e=>{e.preventDefault();
    try{
      const orders=getDB(DB_KEYS.clients,[]),id=document.getElementById('client-id').value;
      const data={nome:document.getElementById('client-nome').value.trim(),empresa:document.getElementById('client-empresa').value.trim(),email:document.getElementById('client-email').value.trim(),status:document.getElementById('client-status').value,valor:Number(document.getElementById('client-valor').value)};
      if(!data.nome||!data.empresa||!Number.isFinite(data.valor)||data.valor<0){showToast('Preencha os campos obrigatórios corretamente.');return}
      if(id){const i=orders.findIndex(o=>o.id===id);if(i<0){showToast('Pedido não encontrado.');return}orders[i]={...orders[i],...data}}else orders.push({id:uid(),...data,criadoEm:Date.now()});
      setDB(DB_KEYS.clients,orders);
      modal.hidden=true;form.reset();document.getElementById('client-id').value='';
      renderClientsTable(canDelete,openClientModal,canEdit);renderDashboardView();showToast(id?'Pedido atualizado.':'Pedido cadastrado.');
    }catch(err){console.error(err);showToast('Não foi possível salvar o pedido. Verifique o armazenamento do navegador.');}
  });
  renderClientsTable(canDelete,openClientModal,canEdit);
}
function renderClientsTable(canDelete,openClientModal,canEdit){const orders=getDB(DB_KEYS.clients,[]),tbody=document.getElementById('clients-tbody'),empty=document.getElementById('clients-empty');tbody.innerHTML='';empty.hidden=orders.length!==0;orders.forEach(o=>{const tr=document.createElement('tr');const valor=Number(o.valor)||0;tr.innerHTML=`<td>${escapeHtml(o.nome)}</td><td>${escapeHtml(o.empresa)}</td><td>${escapeHtml(o.email||'—')}</td><td><span class="status-pill">${escapeHtml(o.status)}</span></td><td>${valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td class="row-actions"></td>`;const cell=tr.querySelector('.row-actions');if(canEdit){const b=document.createElement('button');b.className='btn btn-ghost btn-small';b.textContent='Editar';b.addEventListener('click',()=>openClientModal(o));cell.appendChild(b)}if(canDelete){const b=document.createElement('button');b.className='btn btn-danger btn-small';b.style.marginLeft='6px';b.textContent='Excluir';b.addEventListener('click',()=>{if(confirm(`Excluir o pedido de "${o.nome}"?`)){setDB(DB_KEYS.clients,getDB(DB_KEYS.clients,[]).filter(x=>x.id!==o.id));renderClientsTable(canDelete,openClientModal,canEdit);renderDashboardView();showToast('Pedido excluído.')}});cell.appendChild(b)}tbody.appendChild(tr)})}
function renderUsersView(){const tbody=document.getElementById('users-tbody');if(!tbody)return;tbody.innerHTML='';getDB(DB_KEYS.users,[]).forEach(u=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${escapeHtml(u.username)}</td><td>${u.role==='admin'?'Administrador':'Colaborador'}</td>`;tbody.appendChild(tr)})}
function escapeHtml(str){const d=document.createElement('div');d.textContent=str??'';return d.innerHTML}
let toastTimer;function showToast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,2500)}
