// [원자번호, 기호, 한글 이름]
const ELEMENTS = [
  [1, "H", "수소"], [2, "He", "헬륨"], [3, "Li", "리튬"], [4, "Be", "베릴륨"],
  [5, "B", "붕소"], [6, "C", "탄소"], [7, "N", "질소"], [8, "O", "산소"],
  [9, "F", "플루오린"], [10, "Ne", "네온"], [11, "Na", "나트륨"], [12, "Mg", "마그네슘"],
  [13, "Al", "알루미늄"], [14, "Si", "규소"], [15, "P", "인"], [16, "S", "황"],
  [17, "Cl", "염소"], [18, "Ar", "아르곤"], [19, "K", "칼륨"], [20, "Ca", "칼슘"],
  [21, "Sc", "스칸듐"], [22, "Ti", "타이타늄"], [23, "V", "바나듐"], [24, "Cr", "크로뮴"],
  [25, "Mn", "망가니즈"], [26, "Fe", "철"], [27, "Co", "코발트"], [28, "Ni", "니켈"],
  [29, "Cu", "구리"], [30, "Zn", "아연"], [31, "Ga", "갈륨"], [32, "Ge", "저마늄"],
  [33, "As", "비소"], [34, "Se", "셀레늄"], [35, "Br", "브로민"], [36, "Kr", "크립톤"],
  [47, "Ag", "은"], [50, "Sn", "주석"], [53, "I", "아이오딘"], [79, "Au", "금"],
  [80, "Hg", "수은"], [82, "Pb", "납"], [92, "U", "우라늄"],
];

const TOTAL_Q = 10;
const TIME_LIMIT = 10; // 초
const BEST_KEY = "chem-quiz-best";

const $ = (id) => document.getElementById(id);
const screens = { start: $("screen-start"), game: $("screen-game"), end: $("screen-end") };

let mode = "sym2name";
let level = 20;
let state;
let timerId;

function show(name) {
  for (const k in screens) screens[k].hidden = k !== name;
}

function getBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function setBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* 저장 불가 시 무시 */ }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pool() {
  return ELEMENTS.filter(([n]) => n <= level || (level === 99));
}

function prompt(el) {
  if (mode === "sym2name") return el[1];
  if (mode === "name2sym") return el[2];
  return String(el[0]);
}
function answerText(el) {
  return mode === "name2sym" ? el[1] : el[2];
}

function startGame() {
  const p = pool();
  state = {
    questions: shuffle(p).slice(0, TOTAL_Q),
    pool: p,
    index: 0,
    score: 0,
    streak: 0,
    correct: 0,
  };
  show("game");
  nextQuestion();
}

function nextQuestion() {
  if (state.index >= state.questions.length) return endGame();
  const el = state.questions[state.index];
  $("qnum").textContent = state.index + 1;
  $("score").textContent = state.score;
  $("streak").textContent = state.streak;

  const q = $("question");
  q.textContent = prompt(el);
  q.classList.toggle("small", prompt(el).length > 4);

  const wrongs = shuffle(state.pool.filter((e) => e !== el)).slice(0, 3);
  const choices = shuffle([el, ...wrongs]);
  const box = $("answers");
  box.innerHTML = "";
  for (const c of choices) {
    const b = document.createElement("button");
    b.textContent = answerText(c);
    b.addEventListener("click", () => answer(c === el, b, el));
    box.appendChild(b);
  }
  startTimer(el);
}

function startTimer(el) {
  clearInterval(timerId);
  const start = performance.now();
  state.startedAt = start;
  $("timerbar").style.width = "100%";
  timerId = setInterval(() => {
    const left = TIME_LIMIT - (performance.now() - start) / 1000;
    $("timerbar").style.width = Math.max(0, (left / TIME_LIMIT) * 100) + "%";
    if (left <= 0) answer(false, null, el);
  }, 100);
}

function answer(isCorrect, btn, el) {
  clearInterval(timerId);
  const left = Math.max(0, TIME_LIMIT - (performance.now() - state.startedAt) / 1000);
  const buttons = [...$("answers").children];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.textContent === answerText(el)) b.classList.add("correct");
  });

  if (isCorrect) {
    state.streak++;
    state.correct++;
    // 기본 100점 + 남은 시간 보너스 + 연속 정답 보너스
    state.score += 100 + Math.round(left * 5) + Math.min(state.streak - 1, 5) * 10;
  } else {
    state.streak = 0;
    if (btn) btn.classList.add("wrong");
  }
  $("score").textContent = state.score;
  $("streak").textContent = state.streak;

  state.index++;
  setTimeout(nextQuestion, 900);
}

function endGame() {
  show("end");
  $("final-score").textContent = state.score;
  $("final-detail").textContent = `${TOTAL_Q}문제 중 ${state.correct}문제 정답`;
  const isBest = state.score > getBest();
  if (isBest) setBest(state.score);
  $("newbest").hidden = !isBest;
  $("best").textContent = getBest();
}

function bindOptions(containerId, key, apply) {
  $(containerId).addEventListener("click", (e) => {
    const b = e.target.closest(".opt");
    if (!b) return;
    [...$(containerId).children].forEach((c) => c.classList.remove("active"));
    b.classList.add("active");
    apply(b.dataset[key]);
  });
}

bindOptions("mode-options", "mode", (v) => (mode = v));
bindOptions("level-options", "level", (v) => (level = Number(v)));
$("btn-start").addEventListener("click", startGame);
$("btn-again").addEventListener("click", () => show("start"));
$("best").textContent = getBest();
