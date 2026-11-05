import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBgZe_h6ydOaQVNFQKrNOwnkooG565ZkB0",
    authDomain: "messages-6707f.firebaseapp.com",
    projectId: "messages-6707f",
    storageBucket: "messages-6707f.firebasestorage.app",
    messagingSenderId: "1033412657768",
    appId: "1:1033412657768:web:c614b5a9f48065ee14b1dd",
    measurementId: "G-DZ2VGD4SZM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let activeChatUser = null;
let currentCustomPhoto = "";
let currentDisplayName = "";
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let presenceInterval = null;

let loadedImage = null;
let imgX = 0, imgY = 0;
let imgScale = 1;
let isDragging = false;
let startX = 0, startY = 0;

const authScreen = document.getElementById('auth-screen');
const googleLoginBtn = document.getElementById('google-login-btn');
const anonLoginBtn = document.getElementById('anon-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const userAvatarFallback = document.getElementById('user-avatar-fallback');
const chatListEl = document.getElementById('chat-list');
const noChatSelectedEl = document.getElementById('no-chat-selected');
const activeChatEl = document.getElementById('active-chat');
const activeChatNameEl = document.getElementById('active-chat-name');
const activeChatAvatarEl = document.getElementById('active-chat-avatar');
const activeChatStatusEl = document.getElementById('active-chat-status');
const messageContainer = document.getElementById('message-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const userSearchInput = document.getElementById('user-search');

const sidebarContainer = document.getElementById('sidebar-container');
const chatMainContainer = document.getElementById('chat-main-container');
const backToListBtn = document.getElementById('back-to-list-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const settingsForm = document.getElementById('settings-form');
const settingsNameInput = document.getElementById('settings-name-input');
const settingsFileInput = document.getElementById('settings-file-input');
const saveSettingsSubmit = document.getElementById('save-settings-submit');
const cropContainer = document.getElementById('crop-container');
const cropCanvas = document.getElementById('crop-canvas');
const ctx = cropCanvas.getContext('2d');
const zoomSlider = document.getElementById('zoom-slider');

// Helper function to set user offline instantly
async function setOfflineStatus(user) {
    if (!user) return;
    try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            lastSeen: new Date(0)
        }, { merge: true });
    } catch (err) {
        console.error("Error setting offline status:", err);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            currentCustomPhoto = data.photoURL || user.photoURL || '';
            currentDisplayName = data.displayName || user.displayName || `User_${user.uid.slice(0,5)}`;
        } else {
            currentCustomPhoto = user.photoURL || '';
            currentDisplayName = user.displayName || `User_${user.uid.slice(0,5)}`;
        }

        updateUserHeaderUI(currentDisplayName, currentCustomPhoto);

        const updatePresence = async () => {
            try {
                await setDoc(userDocRef, {
                    uid: user.uid,
                    displayName: currentDisplayName,
                    email: user.email || 'Anonymous',
                    photoURL: currentCustomPhoto,
                    lastSeen: serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.error("Error updating presence:", err);
            }
        };

        await updatePresence();
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = setInterval(updatePresence, 20000);

        startRealtimeUsersListener();
    } else {
        if (currentUser) {
            await setOfflineStatus(currentUser);
        }
        currentUser = null;
        authScreen.classList.remove('hidden');
        if (unsubscribeUsers) unsubscribeUsers();
        if (presenceInterval) clearInterval(presenceInterval);
    }
});

// Trigger offline status instantly when closing tab or browser
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        const userDocRef = doc(db, "users", currentUser.uid);
        setDoc(userDocRef, { lastSeen: new Date(0) }, { merge: true }).catch(() => {});
    }
});

function updateUserHeaderUI(name, photoURL) {
    userNameEl.textContent = name;
    if (photoURL) {
        userAvatarEl.src = photoURL;
        userAvatarEl.classList.remove('hidden');
        userAvatarFallback.classList.add('hidden');
    } else {
        userAvatarEl.classList.add('hidden');
        userAvatarFallback.classList.remove('hidden');
        userAvatarFallback.textContent = (name || 'U')[0].toUpperCase();
    }
}

googleLoginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google Auth Error:", error);
        alert("Failed to sign in with Google.");
    }
});

anonLoginBtn.addEventListener('click', async () => {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.error("Anonymous Auth Error:", error);
    }
});

logoutBtn.addEventListener('click', async () => {
    if (currentUser) {
        await setOfflineStatus(currentUser);
    }
    signOut(auth);
});

settingsBtn.addEventListener('click', () => {
    settingsNameInput.value = currentDisplayName || '';
    settingsFileInput.value = '';
    cropContainer.classList.add('hidden');
    loadedImage = null;
    settingsModal.classList.remove('hidden');
});

const closeSettings = () => settingsModal.classList.add('hidden');
closeSettingsBtn.addEventListener('click', closeSettings);
cancelSettingsBtn.addEventListener('click', closeSettings);

settingsFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            cropContainer.classList.remove('hidden');

            imgScale = Math.max(cropCanvas.width / img.width, cropCanvas.height / img.height);
            zoomSlider.value = imgScale;
            imgX = (cropCanvas.width - img.width * imgScale) / 2;
            imgY = (cropCanvas.height - img.height * imgScale) / 2;

            drawCanvas();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

function drawCanvas() {
    if (!loadedImage) return;
    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(loadedImage, imgX, imgY, loadedImage.width * imgScale, loadedImage.height * imgScale);
}

cropCanvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - imgX;
    startY = e.clientY - imgY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging || !loadedImage) return;
    imgX = e.clientX - startX;
    imgY = e.clientY - startY;
    drawCanvas();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

cropCanvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX - imgX;
    startY = e.touches[0].clientY - imgY;
});

window.addEventListener('touchmove', (e) => {
    if (!isDragging || !loadedImage) return;
    imgX = e.touches[0].clientX - startX;
    imgY = e.touches[0].clientY - startY;
    drawCanvas();
});

window.addEventListener('touchend', () => {
    isDragging = false;
});

zoomSlider.addEventListener('input', (e) => {
    if (!loadedImage) return;
    const oldScale = imgScale;
    imgScale = parseFloat(e.target.value);

    const centerX = cropCanvas.width / 2;
    const centerY = cropCanvas.height / 2;
    imgX = centerX - (centerX - imgX) * (imgScale / oldScale);
    imgY = centerY - (centerY - imgY) * (imgScale / oldScale);

    drawCanvas();
});

settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = settingsNameInput.value.trim();

    saveSettingsSubmit.disabled = true;
    saveSettingsSubmit.textContent = "Saving...";

    try {
        let photoURL = currentCustomPhoto;

        if (loadedImage) {
            photoURL = cropCanvas.toDataURL('image/jpeg', 0.8);
        }

        currentCustomPhoto = photoURL;
        currentDisplayName = newName;

        await setDoc(doc(db, "users", currentUser.uid), {
            displayName: newName,
            photoURL: photoURL,
            lastSeen: serverTimestamp()
        }, { merge: true });

        updateUserHeaderUI(newName, photoURL);
        closeSettings();
    } catch (error) {
        console.error("Error updating profile:", error);
        alert("Failed to update profile.");
    } finally {
        saveSettingsSubmit.disabled = false;
        saveSettingsSubmit.textContent = "Save Changes";
    }
});

function getUserStatus(lastSeenTimestamp) {
    if (!lastSeenTimestamp) return { text: "Offline", isOnline: false };
    const lastSeenDate = lastSeenTimestamp.toDate ? lastSeenTimestamp.toDate() : new Date(lastSeenTimestamp);
    const diffSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;

    if (diffSeconds < 45) {
        return { text: "Online", isOnline: true };
    } else {
        return { text: "Offline", isOnline: false };
    }
}

function startRealtimeUsersListener(filter = "") {
    if (unsubscribeUsers) unsubscribeUsers();

    unsubscribeUsers = onSnapshot(collection(db, "users"), (querySnapshot) => {
        chatListEl.innerHTML = '';
        let count = 0;

        querySnapshot.forEach((docSnap) => {
            const userData = docSnap.data();
            if (currentUser && userData.uid === currentUser.uid) return;
            
            if (filter && !userData.displayName.toLowerCase().includes(filter.toLowerCase())) {
                return;
            }

            count++;
            const div = document.createElement('div');
            div.className = "flex items-center gap-3 p-3 hover:bg-slate-800/50 cursor-pointer transition-colors";
            
            const avatarContent = userData.photoURL 
                ? `<img src="${userData.photoURL}" class="w-10 h-10 rounded-full object-cover">` 
                : userData.displayName[0].toUpperCase();

            const statusInfo = getUserStatus(userData.lastSeen);
            const statusDotColor = statusInfo.isOnline ? "bg-emerald-400" : "bg-slate-500";
            const statusTextColor = statusInfo.isOnline ? "text-emerald-400" : "text-slate-500";

            div.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center shrink-0 overflow-hidden relative">
                    ${avatarContent}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-sm truncate">${userData.displayName}</h4>
                    <span class="text-xs ${statusTextColor} flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDotColor}"></span> ${statusInfo.text}
                    </span>
                </div>
            `;
            div.addEventListener('click', () => openChat(userData));
            chatListEl.appendChild(div);
        });

        if (count === 0) {
            chatListEl.innerHTML = '<div class="p-4 text-center text-slate-500 text-sm">No other users found.</div>';
        }

        if (activeChatUser) {
            const updatedActiveUser = querySnapshot.docs.find(d => d.data().uid === activeChatUser.uid);
            if (updatedActiveUser) {
                const freshData = updatedActiveUser.data();
                activeChatUser = freshData;
                activeChatNameEl.textContent = freshData.displayName;
                activeChatAvatarEl.innerHTML = freshData.photoURL ? `<img src="${freshData.photoURL}" class="w-9 h-9 rounded-full object-cover">` : freshData.displayName[0].toUpperCase();
                
                const activeStatus = getUserStatus(freshData.lastSeen);
                if (activeChatStatusEl) {
                    activeChatStatusEl.textContent = activeStatus.text;
                    activeChatStatusEl.className = `text-xs ${activeStatus.isOnline ? 'text-emerald-400' : 'text-slate-400'}`;
                }
            }
        }
    });
}

userSearchInput.addEventListener('input', (e) => {
    startRealtimeUsersListener(e.target.value);
});

function openChat(user) {
    activeChatUser = user;
    noChatSelectedEl.classList.add('hidden');
    activeChatEl.classList.remove('hidden');

    if (window.innerWidth < 768) {
        sidebarContainer.classList.add('hidden');
        chatMainContainer.classList.remove('hidden');
        chatMainContainer.classList.add('flex');
    } else {
        sidebarContainer.classList.remove('hidden');
        chatMainContainer.classList.remove('hidden');
        chatMainContainer.classList.add('flex');
    }

    activeChatNameEl.textContent = user.displayName;
    activeChatAvatarEl.innerHTML = user.photoURL ? `<img src="${user.photoURL}" class="w-9 h-9 rounded-full object-cover">` : user.displayName[0].toUpperCase();

    const activeStatus = getUserStatus(user.lastSeen);
    if (activeChatStatusEl) {
        activeChatStatusEl.textContent = activeStatus.text;
        activeChatStatusEl.className = `text-xs ${activeStatus.isOnline ? 'text-emerald-400' : 'text-slate-400'}`;
    }

    const chatId = [currentUser.uid, user.uid].sort().join('_');

    if (unsubscribeMessages) unsubscribeMessages();

    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messageContainer.innerHTML = '';
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMe = msg.senderId === currentUser.uid;
            const bubble = document.createElement('div');
            bubble.className = `max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${isMe ? 'bg-brand-600 text-white self-end rounded-br-none' : 'bg-slate-900 border border-slate-800 text-slate-200 self-start rounded-bl-none'}`;
            bubble.innerHTML = `
                <p class="break-words">${escapeHtml(msg.text)}</p>
                <span class="block text-[10px] mt-1 text-right ${isMe ? 'text-indigo-200' : 'text-slate-500'}">${formatTime(msg.timestamp)}</span>
            `;
            messageContainer.appendChild(bubble);
        });
        messageContainer.scrollTop = messageContainer.scrollHeight;
    });
}

backToListBtn.addEventListener('click', () => {
    activeChatUser = null;
    if (unsubscribeMessages) unsubscribeMessages();

    activeChatEl.classList.add('hidden');
    noChatSelectedEl.classList.remove('hidden');

    if (window.innerWidth < 768) {
        sidebarContainer.classList.remove('hidden');
        chatMainContainer.classList.add('hidden');
        chatMainContainer.classList.remove('flex');
    }
});

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !activeChatUser) return;

    const chatId = [currentUser.uid, activeChatUser.uid].sort().join('_');
    messageInput.value = '';

    await addDoc(collection(db, "chats", chatId, "messages"), {
        text: text,
        senderId: currentUser.uid,
        receiverId: activeChatUser.uid,
        timestamp: serverTimestamp()
    });
});

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}