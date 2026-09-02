const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const COUNTDOWN_SECONDS = 5;
const QUESTION_MS = 15000;

const animalAvatars = [
  "\u{1F981}", "\u{1F42F}", "\u{1F43C}", "\u{1F98A}", "\u{1F438}",
  "\u{1F435}", "\u{1F428}", "\u{1F43A}", "\u{1F42E}", "\u{1F437}",
  "\u{1F42D}", "\u{1F430}", "\u{1F439}", "\u{1F43B}", "\u{1F414}",
  "\u{1F427}", "\u{1F986}", "\u{1F989}", "\u{1F422}", "\u{1F419}"
];

const questions = [
  { q: "What is the main purpose of Code in Air?", options: ["Improve camera quality", "Control a computer using hand gestures", "Train a chatbot", "Create a 3D model"], answer: 1 },
  { q: "Which device provides the visual input for Code in Air?", options: ["Microphone", "Keyboard", "Webcam", "Speaker"], answer: 2 },
  { q: "What does MediaPipe primarily do in this project?", options: ["Play audio", "Detect hand landmarks", "Control the monitor", "Store files"], answer: 1 },
  { q: "How many landmarks are used to represent one hand in MediaPipe Hand Landmarker?", options: ["10", "15", "21", "25"], answer: 2 },
  { q: "What is a hand landmark?", options: ["A camera setting", "A key point on the hand", "A type of gesture", "A screen coordinate"], answer: 1 },
  { q: "Which technology is mainly responsible for webcam and image/frame processing?", options: ["NumPy", "Pillow", "OpenCV", "MediaPipe"], answer: 2 },
  { q: "Which sequence best describes the Code in Air pipeline?", options: ["Action -> Camera -> Gesture -> Landmark", "Camera -> Landmarks -> Gesture -> Action", "Gesture -> Camera -> Action -> Landmark", "Landmark -> Action -> Camera -> Gesture"], answer: 1 },
  { q: "If you wanted to add a new gesture to Code in Air, what would you need to do?", options: ["Replace the webcam", "Detect the gesture and map it to an action", "Remove MediaPipe", "Change the monitor"], answer: 1 },
  { q: "What is the biggest idea behind Code in Air?", options: ["Making computers faster", "Turning visual data into meaningful interaction", "Replacing Python", "Improving internet speed"], answer: 1 },
  { q: "Suppose your hand moves slightly while you are trying to maintain a pinch. Which mechanisms help keep the interaction stable?", options: ["Smoothing and hysteresis", "Pillow and screenshots", "ROI and saving", "Brush size and colors"], answer: 0 }
];

let countdownTimer = null;
let questionTimer = null;
let state = freshState();

function freshState() {
  return {
    quizId: "ATC2026",
    phase: "lobby",
    current: -1,
    accepting: false,
    participants: new Map(),
    startedAt: null,
    questionEndsAt: null,
    countdown: 0
  };
}

function clearTimers() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (questionTimer) clearTimeout(questionTimer);
  countdownTimer = null;
  questionTimer = null;
}

function publicQuestion(index) {
  if (index < 0 || index >= questions.length) return null;
  const question = questions[index];
  return {
    index,
    q: question.q,
    options: question.options
  };
}

function leaderboard() {
  return [...state.participants.values()]
    .sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.name.localeCompare(b.name))
    .map((participant, index) => ({
      rank: index + 1,
      name: participant.name,
      score: participant.score,
      avatar: participant.avatar,
      answered: participant.answers.size
    }));
}

function participantPayload(participant) {
  const leaders = leaderboard();
  const rank = leaders.find(row => row.name === participant.name)?.rank || null;

  return {
    name: participant.name,
    avatar: participant.avatar,
    score: participant.score,
    rank,
    answered: participant.answers.size
  };
}

function questionPayload() {
  const remainingMs = state.questionEndsAt ? Math.max(0, state.questionEndsAt - Date.now()) : QUESTION_MS;

  return {
    question: publicQuestion(state.current),
    durationMs: remainingMs,
    fullDurationMs: QUESTION_MS,
    total: questions.length
  };
}

function countdownPayload() {
  return {
    value: state.countdown,
    nextQuestion: state.current,
    total: questions.length
  };
}

function currentResults() {
  const question = publicQuestion(state.current);
  if (!question) {
    return {
      question: null,
      correctAnswer: null,
      answerCounts: [],
      answered: 0,
      correctCount: 0,
      totalParticipants: state.participants.size,
      leaderboard: leaderboard()
    };
  }

  const correctAnswer = questions[state.current].answer;
  const answerCounts = question.options.map(() => 0);
  let answered = 0;
  let correctCount = 0;

  for (const participant of state.participants.values()) {
    const answer = participant.answers.get(state.current);
    if (!answer) continue;
    answered += 1;
    answerCounts[answer.answer] += 1;
    if (answer.correct) correctCount += 1;
  }

  return {
    question,
    correctAnswer,
    answerCounts,
    answered,
    correctCount,
    totalParticipants: state.participants.size,
    leaderboard: leaderboard()
  };
}

function statusPayload() {
  return {
    quizId: state.quizId,
    phase: state.phase,
    current: state.current,
    total: questions.length,
    accepting: state.accepting,
    countdown: state.countdown,
    participants: state.participants.size,
    question: publicQuestion(state.current),
    remainingMs: state.questionEndsAt ? Math.max(0, state.questionEndsAt - Date.now()) : 0,
    leaderboard: leaderboard()
  };
}

function broadcastStatus() {
  io.emit("status", statusPayload());
}

function startCountdown(nextQuestion) {
  if (nextQuestion >= questions.length) {
    finishQuiz();
    return;
  }

  clearTimers();
  state.phase = "countdown";
  state.current = nextQuestion;
  state.accepting = false;
  state.startedAt = null;
  state.questionEndsAt = null;
  state.countdown = COUNTDOWN_SECONDS;

  io.emit("countdown", countdownPayload());
  broadcastStatus();

  countdownTimer = setInterval(() => {
    state.countdown -= 1;

    if (state.countdown > 0) {
      io.emit("countdown", countdownPayload());
      broadcastStatus();
      return;
    }

    clearInterval(countdownTimer);
    countdownTimer = null;
    startQuestion(nextQuestion);
  }, 1000);
}

function startQuestion(index) {
  state.phase = "question";
  state.current = index;
  state.accepting = true;
  state.startedAt = Date.now();
  state.questionEndsAt = state.startedAt + QUESTION_MS;
  state.countdown = 0;

  io.emit("question", questionPayload());
  broadcastStatus();

  questionTimer = setTimeout(() => {
    finishQuestion();
  }, QUESTION_MS);
}

function finishQuestion() {
  if (state.current < 0 || state.current >= questions.length) return;

  if (questionTimer) clearTimeout(questionTimer);
  questionTimer = null;
  state.phase = "results";
  state.accepting = false;
  state.questionEndsAt = null;
  state.countdown = 0;

  io.emit("results", currentResults());
  broadcastStatus();
}

function finishQuiz() {
  clearTimers();
  state.phase = "finished";
  state.accepting = false;
  state.questionEndsAt = null;
  state.countdown = 0;

  io.emit("finished", {
    leaderboard: leaderboard(),
    totalQuestions: questions.length
  });
  broadcastStatus();
}

function assignAvatar() {
  const usedCount = state.participants.size;
  return animalAvatars[usedCount % animalAvatars.length];
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/info", async (req, res) => {
  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const joinUrl = `${protocol}://${host}/join.html`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 500, margin: 2 });

  res.json({
    quizId: state.quizId,
    joinUrl,
    qrDataUrl,
    totalQuestions: questions.length,
    title: "Advanced Tech Club - Code in Air Quiz"
  });
});

app.get("/api/questions", (req, res) => {
  res.json({ questions: questions.map((_, index) => publicQuestion(index)) });
});

io.on("connection", socket => {
  socket.emit("status", statusPayload());

  if (state.phase === "countdown") socket.emit("countdown", countdownPayload());
  if (state.phase === "question") socket.emit("question", questionPayload());
  if (state.phase === "results") socket.emit("results", currentResults());
  if (state.phase === "finished") {
    socket.emit("finished", {
      leaderboard: leaderboard(),
      totalQuestions: questions.length
    });
  }

  socket.on("admin:reset", () => {
    clearTimers();
    state = freshState();
    io.emit("reset", statusPayload());
    broadcastStatus();
  });

  socket.on("admin:start", () => {
    if (state.phase === "lobby") {
      startCountdown(0);
      return;
    }

    if (state.phase === "results") startCountdown(state.current + 1);
  });

  socket.on("admin:next", () => {
    if (state.phase === "question") {
      finishQuestion();
      return;
    }

    if (state.phase === "lobby") {
      startCountdown(0);
      return;
    }

    if (state.phase === "results") {
      startCountdown(state.current + 1);
      return;
    }

    if (state.phase === "finished") {
      socket.emit("finished", {
        leaderboard: leaderboard(),
        totalQuestions: questions.length
      });
    }
  });

  socket.on("admin:lock", () => {
    if (state.phase === "question") finishQuestion();
  });

  socket.on("admin:show-results", () => {
    if (state.phase === "question") {
      finishQuestion();
      return;
    }

    if (state.phase === "results") {
      io.emit("results", currentResults());
      broadcastStatus();
    }
  });

  socket.on("join", ({ name }) => {
    const cleanName = String(name || "").trim().slice(0, 28);
    if (!cleanName) {
      socket.emit("join:error", "Please enter your name.");
      return;
    }

    const existing = [...state.participants.values()]
      .find(participant => participant.name.toLowerCase() === cleanName.toLowerCase());

    if (existing) {
      socket.emit("join:error", "That name is already in use. Try another name.");
      return;
    }

    const participant = {
      name: cleanName,
      avatar: assignAvatar(),
      score: 0,
      totalTime: 0,
      answers: new Map()
    };

    state.participants.set(socket.id, participant);
    socket.data.player = true;
    socket.emit("joined", {
      participant: participantPayload(participant),
      phase: state.phase,
      current: state.current,
      total: questions.length
    });

    if (state.phase === "countdown") socket.emit("countdown", countdownPayload());
    if (state.phase === "question" && state.accepting) socket.emit("question", questionPayload());
    if (state.phase === "results") socket.emit("results", currentResults());
    if (state.phase === "finished") {
      socket.emit("finished", {
        leaderboard: leaderboard(),
        totalQuestions: questions.length
      });
    }

    broadcastStatus();
  });

  socket.on("answer", ({ index, answer }) => {
    const participant = state.participants.get(socket.id);
    const question = questions[index];
    const numericAnswer = Number(answer);

    if (
      !participant ||
      !state.accepting ||
      index !== state.current ||
      !question ||
      !Number.isInteger(numericAnswer) ||
      numericAnswer < 0 ||
      numericAnswer >= question.options.length ||
      participant.answers.has(index)
    ) {
      return;
    }

    const elapsed = Math.min(QUESTION_MS, Math.max(0, Date.now() - state.startedAt));
    const correct = numericAnswer === question.answer;
    const speedBonus = correct ? Math.max(0, Math.round((QUESTION_MS - elapsed) / 1000)) * 50 : 0;
    const points = correct ? 1000 + speedBonus : 0;

    if (correct) {
      participant.score += points;
      participant.totalTime += elapsed;
    }

    participant.answers.set(index, {
      answer: numericAnswer,
      correct,
      points,
      elapsed
    });

    socket.emit("answer:received", {
      received: true,
      participant: participantPayload(participant)
    });

    broadcastStatus();
  });

  socket.on("disconnect", () => {
    if (state.participants.has(socket.id)) {
      state.participants.delete(socket.id);
      broadcastStatus();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Advanced Tech Club Quiz running at http://localhost:${PORT}`);
});
