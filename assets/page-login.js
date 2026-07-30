async function checkStatus(){
  try{
    const res = await fetch('/api/auth');
    if(!res.ok) throw new Error("réponse serveur "+res.status);
    const data = await res.json();
    return data.hasPassword;
  }catch(e){
    document.getElementById('loginError').innerHTML = `<div class="error-msg">Impossible de joindre le serveur : ${e.message}</div>`;
    return null;
  }
}

async function renderLoginForm(){
  const zone = document.getElementById('loginFormZone');
  zone.innerHTML = `<p class="hint">Connexion au serveur…</p>`;
  const hasPassword = await checkStatus();
  if(hasPassword === null) { zone.innerHTML = ""; return; }

  if(!hasPassword){
    zone.innerHTML = `
      <div class="field"><label>Email autorisé</label><input id="liEmail" type="email" placeholder="${ALLOWED_EMAIL}"></div>
      <div class="field"><label>Créer un mot de passe</label><input id="liPass1" type="password" placeholder="Minimum 4 caractères"></div>
      <div class="field"><label>Confirmer le mot de passe</label><input id="liPass2" type="password"></div>
      <button class="btn btn-primary" id="liSetupBtn">Créer l'accès</button>
      <p class="hint">Premier lancement : cet accès sera le seul valable ensuite pour cette appli.</p>
    `;
    document.getElementById('liSetupBtn').onclick = async ()=>{
      const email = document.getElementById('liEmail').value.trim().toLowerCase();
      const p1 = document.getElementById('liPass1').value;
      const p2 = document.getElementById('liPass2').value;
      const err = document.getElementById('loginError');
      err.innerHTML = "";
      if(email !== ALLOWED_EMAIL){
        err.innerHTML = `<div class="error-msg">Seule l'adresse ${ALLOWED_EMAIL} est autorisée.</div>`; return;
      }
      if(p1.length < 4){ err.innerHTML = `<div class="error-msg">Mot de passe trop court (4 caractères min).</div>`; return; }
      if(p1 !== p2){ err.innerHTML = `<div class="error-msg">Les mots de passe ne correspondent pas.</div>`; return; }
      try{
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setup', email, password: p1 })
        });
        const data = await res.json();
        if(!res.ok){ err.innerHTML = `<div class="error-msg">${data.error||'Erreur.'}</div>`; return; }
        setToken(data.token);
        window.location.href = 'planning.html';
      }catch(e){
        err.innerHTML = `<div class="error-msg">Connexion au serveur impossible : ${e.message}</div>`;
      }
    };
  } else {
    zone.innerHTML = `
      <div class="field"><label>Email</label><input id="liEmail" type="email" placeholder="${ALLOWED_EMAIL}"></div>
      <div class="field"><label>Mot de passe</label><input id="liPass" type="password"></div>
      <button class="btn btn-primary" id="liLoginBtn">Se connecter</button>
      <p class="hint">Accès réservé à ${ALLOWED_EMAIL}</p>
    `;
    const doLogin = async ()=>{
      const email = document.getElementById('liEmail').value.trim().toLowerCase();
      const p = document.getElementById('liPass').value;
      const err = document.getElementById('loginError');
      err.innerHTML = "";
      try{
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', email, password: p })
        });
        const data = await res.json();
        if(!res.ok){ err.innerHTML = `<div class="error-msg">${data.error||'Email ou mot de passe incorrect.'}</div>`; return; }
        setToken(data.token);
        window.location.href = 'planning.html';
      }catch(e){
        err.innerHTML = `<div class="error-msg">Connexion au serveur impossible : ${e.message}</div>`;
      }
    };
    document.getElementById('liLoginBtn').onclick = doLogin;
    zone.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  }
}

renderLoginForm();
