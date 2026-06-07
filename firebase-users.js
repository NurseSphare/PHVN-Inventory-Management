/**
 * PediVent shared auth + Firestore profiles (works on all devices).
 * Enable Firebase Console → Authentication → Email/Password before use.
 */
(function(global){
  const firebaseConfig = {
    apiKey: 'AIzaSyCPLlEFCMsx1QiJwvJ3f5tq4O8nov6NHMI',
    authDomain: 'pedivent-inventory.firebaseapp.com',
    projectId: 'pedivent-inventory',
    storageBucket: 'pedivent-inventory.firebasestorage.app',
    messagingSenderId: '508971103562',
    appId: '1:508971103562:web:6088812ad8471f4d9fbdb3',
    measurementId: 'G-WEW4RD69VN'
  };

  if(!global.firebase || !global.firebase.apps.length){
    global.firebase.initializeApp(firebaseConfig);
  }

  const auth = global.firebase.auth();
  const db = global.firebase.firestore();
  const USERS_COL = 'users';
  const RESET_COL = 'passwordResetRequests';
  const AUTH_DOMAIN = '@pedivent.local';
const PROTECTED_ADMIN_USERNAME = 'Hajer@2007';
const PROTECTED_ADMIN_EMAIL = 'hmssoon@gmail.com';
  function getSecondaryAuth(){
    let secondaryApp;
    try{
      secondaryApp = global.firebase.app('Secondary');
    }catch(error){
      secondaryApp = global.firebase.initializeApp(firebaseConfig, 'Secondary');
    }
    return global.firebase.auth(secondaryApp);
  }

  function toAuthEmail(value){
    const text = String(value || '').trim().toLowerCase();
    if(!text) return '';
    if(text.includes('@')) return text;
    return text + AUTH_DOMAIN;
  }

  function buildSearchKeys(profile){
    const parts = [
      profile.name,
      profile.username,
      profile.email,
      profile.authEmail,
      profile.authEmail ? profile.authEmail.split('@')[0] : ''
    ];
    const keys = new Set();
    parts.forEach(function(part){
      const key = String(part || '').trim().toLowerCase();
      if(key) keys.add(key);
    });
    return Array.from(keys);
  }

  function profileFromDoc(doc){
    const data = doc.data() || {};
    return normalizeProfile(Object.assign({ uid: doc.id }, data));
  }

  function normalizeProfile(user){
    const profile = Object.assign({}, user);
    profile.uid = profile.uid || profile.id || '';
    profile.id = profile.uid;
    profile.phone = profile.phone || 'Not added';
    profile.area = profile.area || 'Pediatric Home Ventilation';
    profile.profileType = profile.profileType || 'Inventory Team Member';
    profile.status = profile.status === 'approved' ? 'approved' : (profile.status || 'pending');
    profile.username = String(profile.username || profile.name || '').trim();
    profile.authEmail = profile.authEmail || toAuthEmail(profile.email || profile.username);
    profile.email = profile.email || profile.authEmail;
    if(isProtectedAdmin(profile)){
      profile.role = 'Admin';
      profile.status = 'approved';
    }
    return profile;
  }

function isProtectedAdmin(user){
  if(!user) return false;

  const adminUsername = PROTECTED_ADMIN_USERNAME.toLowerCase();
  const adminEmail = PROTECTED_ADMIN_EMAIL.toLowerCase();

  return [
    user.username,
    user.name,
    user.email,
    user.authEmail
  ].some(function(v){
    const value = String(v || '').toLowerCase();
    return value === adminUsername || value === adminEmail;
  });
}

  function mapAuthError(error){
    const code = String(error && error.code ? error.code : '');
    if(code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'){
      return 'Incorrect username, password, or role.';
    }
    if(code === 'auth/email-already-in-use') return 'This email is already registered.';
    if(code === 'auth/weak-password') return 'Password must be at least 6 characters.';
    if(code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
    if(code === 'auth/network-request-failed') return 'Network error. Check your internet connection.';
    return (error && error.message) ? error.message : 'Authentication failed.';
  }

  async function findProfileByIdentifier(identifier){
    const raw = String(identifier || '').trim();
    if(!raw) return null;
    const key = raw.toLowerCase();
    const authEmail = toAuthEmail(raw);

    let snap = await db.collection(USERS_COL).where('authEmail', '==', authEmail).limit(1).get();
    if(!snap.empty) return profileFromDoc(snap.docs[0]);

    snap = await db.collection(USERS_COL).where('searchKeys', 'array-contains', key).limit(1).get();
    if(!snap.empty) return profileFromDoc(snap.docs[0]);

    return null;
  }

  async function getProfileByUid(uid){
    if(!uid) return null;
    const doc = await db.collection(USERS_COL).doc(uid).get();
    if(!doc.exists) return null;
    return profileFromDoc(doc);
  }

  function cacheSession(profile){
    const sessionUser = {
      uid: profile.uid,
      id: profile.uid,
      name: profile.name,
      email: profile.email || profile.authEmail,
      role: profile.role,
      status: profile.status || 'approved'
    };
    if(profile.role === 'Admin'){
      localStorage.setItem('currentAdmin', JSON.stringify(sessionUser));
      localStorage.removeItem('currentUser');
    }else{
      localStorage.setItem('currentUser', JSON.stringify(sessionUser));
      localStorage.removeItem('currentAdmin');
    }
    sessionStorage.setItem('pediventLoggedIn', 'true');
    sessionStorage.setItem('pediventUserRole', profile.role || '');
    sessionStorage.setItem('pediventUserName', profile.name || '');
    sessionStorage.setItem('pediventUserEmail', profile.email || profile.authEmail || '');
    sessionStorage.setItem('pediventUserUid', profile.uid || '');
  }

  function clearSessionCache(){
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentAdmin');
    sessionStorage.removeItem('pediventLoggedIn');
    sessionStorage.removeItem('pediventUserRole');
    sessionStorage.removeItem('pediventUserName');
    sessionStorage.removeItem('pediventUserEmail');
    sessionStorage.removeItem('pediventUserUid');
    sessionStorage.removeItem('pediventDashboardSource');
  }

  async function writeProfile(uid, data){
    const profile = normalizeProfile(Object.assign({ uid: uid }, data));
    profile.searchKeys = buildSearchKeys(profile);
    profile.updatedAt = global.firebase.firestore.FieldValue.serverTimestamp();
    await db.collection(USERS_COL).doc(uid).set(profile, { merge: true });
    return profile;
  }

  async function createAuthAccount(authEmail, password){
    const secondaryAuth = getSecondaryAuth();
    const credential = await secondaryAuth.createUserWithEmailAndPassword(authEmail, password);
    await secondaryAuth.signOut();
    return credential.user.uid;
  }

  async function signUpAccount(payload){
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const role = String(payload.role || '').trim();
    const password = String(payload.password || '').trim();
    if(!name || !email || !role || !password) throw new Error('Please complete all fields.');
    if(role === 'Admin') throw new Error('Admin account is managed separately. Please choose your team role.');
    if(password.length < 6) throw new Error('Password must be at least 6 characters.');

    const authEmail = toAuthEmail(email);
    const existing = await findProfileByIdentifier(email);
    if(existing) throw new Error('This email is already registered.');

    const snap = await db.collection(USERS_COL).where('searchKeys', 'array-contains', name.toLowerCase()).limit(1).get();
    if(!snap.empty) throw new Error('This full name is already registered.');

    const uid = await createAuthAccount(authEmail, password);
    const profile = await writeProfile(uid, {
      name: name,
      username: name,
      email: email,
      authEmail: authEmail,
      phone: 'Not added',
      role: role,
      area: 'Pediatric Home Ventilation',
      profileType: 'Inventory Team Member',
      status: 'pending',
      mustChangePassword: false,
      requestDate: new Date().toLocaleString(),
      source: 'index-signup'
    });
    await auth.signOut();
    return profile;
  }
async function signInAccount(identifier, password, role){
  const loginIdentifier = String(identifier || '').trim().toLowerCase();
  const isProtectedAdminLogin = role === 'Admin' && (
    loginIdentifier === PROTECTED_ADMIN_USERNAME.toLowerCase() ||
    loginIdentifier === PROTECTED_ADMIN_EMAIL.toLowerCase()
  );

  let profile = null;
  let authEmail = isProtectedAdminLogin ? PROTECTED_ADMIN_EMAIL : toAuthEmail(identifier);

  // مهم: الأدمن لا يقرأ Firestore قبل تسجيل الدخول
  if(!isProtectedAdminLogin && !String(identifier || '').includes('@')){
    try{
      profile = await findProfileByIdentifier(identifier);
      if(profile) authEmail = profile.authEmail;
    }catch(error){
      throw new Error('Please sign in using your registered email address.');
    }
  }

  let credential;
  try{
    credential = await auth.signInWithEmailAndPassword(authEmail, password);
  }catch(error){
    throw new Error('Incorrect username, password, or role.');
  }

  let fresh = await getProfileByUid(credential.user.uid);

  if(!fresh && isProtectedAdminLogin){
    fresh = await writeProfile(credential.user.uid, {
      name: 'Hajer',
      username: PROTECTED_ADMIN_USERNAME,
      email: PROTECTED_ADMIN_EMAIL,
      authEmail: PROTECTED_ADMIN_EMAIL,
      role: 'Admin',
      status: 'approved',
      mustChangePassword: false,
      area: 'Pediatric Home Ventilation',
      profileType: 'Inventory Team Member'
    });
  }

  if(!fresh){
    await auth.signOut();
    throw new Error('Account profile was not found.');
  }

  if(fresh.status === 'pending'){
    await auth.signOut();
    throw new Error('Your account is pending admin approval.');
  }

  if(fresh.status !== 'approved'){
    await auth.signOut();
    throw new Error('Your account is not approved yet.');
  }

  if(fresh.role !== role){
    await auth.signOut();
    throw new Error('Incorrect role. Please select: ' + fresh.role);
  }

  if(fresh.mustChangePassword) return fresh;

  cacheSession(fresh);
  return fresh;
}

  async function updateCurrentPassword(newPassword){
    const user = auth.currentUser;
    if(!user) throw new Error('Not signed in.');
    if(newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    await user.updatePassword(newPassword);
    await writeProfile(user.uid, { mustChangePassword: false });
    const profile = await getProfileByUid(user.uid);
    if(profile) cacheSession(profile);
    return profile;
  }

  async function signOutUser(){
    clearSessionCache();
    await auth.signOut();
  }
function waitForAuthReady(timeoutMs){
  timeoutMs = timeoutMs || 7000;

  if(auth.currentUser){
    return Promise.resolve(auth.currentUser);
  }

  return new Promise(function(resolve){
    let settled = false;
    let unsubscribe = null;

    const timer = setTimeout(function(){
      if(settled) return;
      settled = true;
      if(typeof unsubscribe === 'function') unsubscribe();
      resolve(auth.currentUser || null);
    }, timeoutMs);

    unsubscribe = auth.onAuthStateChanged(function(user){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      if(typeof unsubscribe === 'function') unsubscribe();
      resolve(user || null);
    });
  });
}

function redirectToIndex(){
  global.location.href = 'index.html?v=30';
}

async function requireAuthProfile(options){
  options = options || {};

  const user = await waitForAuthReady(options.timeoutMs || 7000);

  if(!user){
    if(options.redirect !== false) redirectToIndex();
    return null;
  }

  const profile = await getProfileByUid(user.uid);

  if(!profile || profile.status !== 'approved'){
    await signOutUser();
    if(options.redirect !== false) redirectToIndex();
    return null;
  }

  if(isProtectedAdmin(profile)){
    profile.role = 'Admin';
    profile.status = 'approved';
  }

  cacheSession(profile);
  return profile;
}

async function requireAdminProfile(options){
  options = options || {};
  const profile = await requireAuthProfile(options);

  if(!profile) return null;

  if(profile.role !== 'Admin'){
    await signOutUser();
    if(options.redirect !== false) redirectToIndex();
    return null;
  }

  return profile;
}

  async function fetchAllUsers(){
    const snap = await db.collection(USERS_COL).get();
    return snap.docs.map(profileFromDoc).map(normalizeProfile);
  }

  async function fetchPasswordResetRequests(){
    const snap = await db.collection(RESET_COL).orderBy('requestDateSort', 'desc').get().catch(async function(){
      return db.collection(RESET_COL).get();
    });
    return snap.docs.map(function(doc){
      const data = doc.data() || {};
      return Object.assign({ id: doc.id, uid: doc.id }, data);
    });
  }

  async function savePasswordResetRequest(data){
    const payload = Object.assign({}, data, {
      status: data.status || 'pending',
      requestDate: data.requestDate || new Date().toLocaleString(),
      requestDateSort: Date.now()
    });
    if(data.id){
      await db.collection(RESET_COL).doc(String(data.id)).set(payload, { merge: true });
      return String(data.id);
    }
    const ref = await db.collection(RESET_COL).add(payload);
    return ref.id;
  }

  async function approveUser(uid){
    await db.collection(USERS_COL).doc(uid).set({
      status: 'approved',
      approvedAt: new Date().toLocaleString(),
      updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function rejectUser(uid){
    await db.collection(USERS_COL).doc(uid).delete();
  }

  async function saveTeamMemberProfile(data, existingUid){
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();
    const password = String(data.password || '').trim() || '123456';
    const authEmail = toAuthEmail(email);
    if(!name || !email) throw new Error('Please add name and email.');
    if(password.length < 6) throw new Error('Password must be at least 6 characters.');

    let uid = existingUid || '';
    if(!uid){
      uid = await createAuthAccount(authEmail, password);
    }

    await writeProfile(uid, {
      name: name,
      username: name,
      email: email,
      authEmail: authEmail,
      role: data.role || 'Inventory Team Member',
      phone: data.phone || 'Not added',
      area: data.area || 'Pediatric Home Ventilation',
      profileType: data.profileType || 'Inventory Team Member',
      status: data.status || 'approved',
      mustChangePassword: !!data.mustChangePassword
    });
    return uid;
  }

  async function createPendingAccountRequest(data){
    const authEmail = toAuthEmail(data.email);
    const uid = await createAuthAccount(authEmail, data.password || '123456');
    await writeProfile(uid, {
      name: data.name,
      username: data.name,
      email: data.email,
      authEmail: authEmail,
      phone: data.phone || 'Not added',
      role: data.role || 'Inventory Team Member',
      area: 'Pediatric Home Ventilation',
      profileType: 'Inventory Team Member',
      status: 'pending',
      requestDate: new Date().toLocaleString(),
      source: 'admin-request'
    });
    return uid;
  }

  async function adminResetUserPassword(profile, newPassword){
    if(!profile || !profile.authEmail) throw new Error('User account not found.');
    if(String(newPassword || '').length < 6) throw new Error('Password must be at least 6 characters.');
    try{
      await auth.sendPasswordResetEmail(profile.authEmail);
    }catch(error){
      console.warn('Password reset email failed:', error);
    }
    await writeProfile(profile.uid, { mustChangePassword: true });
    return true;
  }

  function listenUsers(callback){
    return db.collection(USERS_COL).onSnapshot(function(snap){
      const list = snap.docs.map(profileFromDoc).map(normalizeProfile);
      callback(list);
    });
  }

  function listenPasswordResetRequests(callback){
    return db.collection(RESET_COL).onSnapshot(function(snap){
      const list = snap.docs.map(function(doc){
        return Object.assign({ id: doc.id, uid: doc.id }, doc.data() || {});
      });
      callback(list);
    });
  }

  async function migrateLocalStorageUsers(){
    let localUsers = [];
    try{
      localUsers = JSON.parse(localStorage.getItem('users') || '[]');
    }catch(error){
      localUsers = [];
    }
    if(!Array.isArray(localUsers) || !localUsers.length) return { migrated: 0, skipped: 0 };

    let migrated = 0;
    let skipped = 0;
    for(const item of localUsers){
      const email = item.email || item.username || item.name;
      if(!email) { skipped++; continue; }
      const existing = await findProfileByIdentifier(email);
      if(existing){ skipped++; continue; }
      const authEmail = toAuthEmail(email);
      const password = String(item.password || '123456');
      try{
        const uid = await createAuthAccount(authEmail, password.length >= 6 ? password : '123456');
        await writeProfile(uid, Object.assign({}, item, {
          authEmail: authEmail,
          status: item.status || 'approved',
          mustChangePassword: !!item.mustChangePassword
        }));
        migrated++;
      }catch(error){
        skipped++;
        console.warn('Migration skipped for', email, error);
      }
    }
    return { migrated: migrated, skipped: skipped };
  }

  global.PediVentFirebase = {
    auth: auth,
    db: db,
    toAuthEmail: toAuthEmail,
    findProfileByIdentifier: findProfileByIdentifier,
    getProfileByUid: getProfileByUid,
    signUpAccount: signUpAccount,
    signInAccount: signInAccount,
    updateCurrentPassword: updateCurrentPassword,
    signOutUser: signOutUser,
    requireAuthProfile: requireAuthProfile,
    requireAdminProfile: requireAdminProfile,
    fetchAllUsers: fetchAllUsers,
    fetchPasswordResetRequests: fetchPasswordResetRequests,
    savePasswordResetRequest: savePasswordResetRequest,
    approveUser: approveUser,
    rejectUser: rejectUser,
    saveTeamMemberProfile: saveTeamMemberProfile,
    createPendingAccountRequest: createPendingAccountRequest,
    adminResetUserPassword: adminResetUserPassword,
    listenUsers: listenUsers,
    listenPasswordResetRequests: listenPasswordResetRequests,
    migrateLocalStorageUsers: migrateLocalStorageUsers,
    cacheSession: cacheSession,
    clearSessionCache: clearSessionCache,
    normalizeProfile: normalizeProfile,
    isProtectedAdmin: isProtectedAdmin,
    mapAuthError: mapAuthError
  };
})(window);
