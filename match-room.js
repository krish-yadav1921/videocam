// Firebase + WebRTC video call logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MSG_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCallBtn = document.getElementById("startCallBtn");
const cameraToggleBtn = document.getElementById("cameraToggleBtn");
const micToggleBtn = document.getElementById("micToggleBtn");
const readyBtn = document.getElementById("readyBtn");

const matchId = new URLSearchParams(window.location.search).get("matchId");

let currentUser;
let localStream;
let peerConnection;
let isCameraOn = true;
let isMicOn = true;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await setupMatch();
  } else {
    alert("Please sign in first.");
    window.location.href = "index.html";
  }
});

async function setupMatch() {
  const matchRef = doc(db, "roastMatches", matchId);
  const matchDoc = await getDoc(matchRef);
  const matchData = matchDoc.data();

  const player1Info = matchData.player1Info;
  const player2Info = matchData.player2Info;

  if (player1Info) {
    document.getElementById("player1Name").innerText = player1Info.name;
    document.getElementById("player1Img").src = player1Info.photo || "default1.png";
  }

  if (player2Info) {
    document.getElementById("player2Name").innerText = player2Info.name;
    document.getElementById("player2Img").src = player2Info.photo || "default2.png";
  }

  if (player1Info && player2Info) {
    readyBtn.classList.remove("hidden");
  }

  await startCamera();

  const roomRef = doc(db, "rooms", matchId);
  const roomSnapshot = await getDoc(roomRef);

  peerConnection = new RTCPeerConnection(servers);
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      const candidateType = currentUser.uid === matchData.player1 ? "callerCandidates" : "calleeCandidates";
      const candidatesRef = doc(db, "rooms", matchId);
      await updateDoc(candidatesRef, {
        [candidateType]: [...(roomSnapshot.data()?.[candidateType] || []), event.candidate.toJSON()]
      });
    }
  };

  if (!roomSnapshot.exists()) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await setDoc(roomRef, {
      offer,
      callerCandidates: [],
      calleeCandidates: []
    });
  } else if (roomSnapshot.data().offer && !roomSnapshot.data().answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(roomSnapshot.data().offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await updateDoc(roomRef, { answer });
  }

  onSnapshot(roomRef, (snapshot) => {
    const data = snapshot.data();
    if (data?.answer && !peerConnection.remoteDescription?.type) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  const candidateType = currentUser.uid === matchData.player1 ? "calleeCandidates" : "callerCandidates";
  onSnapshot(roomRef, (snapshot) => {
    const data = snapshot.data();
    if (data?.[candidateType]) {
      data[candidateType].forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
    }
  });
}

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.error("Camera error:", error);
    alert("Camera not accessible. Please allow camera/mic access.");
  }
}

startCallBtn.addEventListener("click", async () => {
  alert("Call started!");
});

cameraToggleBtn.addEventListener("click", () => {
  isCameraOn = !isCameraOn;
  localStream.getVideoTracks()[0].enabled = isCameraOn;
  cameraToggleBtn.innerText = isCameraOn ? "🎥 On" : "🎥 Off";
});

micToggleBtn.addEventListener("click", () => {
  isMicOn = !isMicOn;
  localStream.getAudioTracks()[0].enabled = isMicOn;
  micToggleBtn.innerText = isMicOn ? "🎤 On" : "🎤 Off";
});

readyBtn.addEventListener("click", async () => {
  alert("You're ready to battle! 🔥");

  const matchRef = doc(db, "roastMatches", matchId);
  const matchSnap = await getDoc(matchRef);
  const matchData = matchSnap.data();

  const readyField = currentUser.uid === matchData.player1 ? "player1Ready" : "player2Ready";
  await updateDoc(matchRef, {
    [readyField]: true
  });

  window.location.href = `battle.html?matchId=${matchId}`;
});
