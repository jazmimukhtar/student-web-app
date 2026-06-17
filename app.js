// ==========================================================================
// CONFIGURATION & GLOBAL STATES
// ==========================================================================
// Nota Keselamatan: GEMINI_API_KEY dibiarkan kosong untuk keselamatan GitHub Public.
// Kunci API akan dibaca secara selamat melalui parameter URL (?key=AIzaSy...)
const GEMINI_API_KEY = ""; 
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx0a74qc1p5btbw6tu--FOF9JcjgdAbEj2pSqRgZJ3IEfPHL6VgFPVs0JkzMkjWAWlZ/exec"; 

let quizId = null;
let sessionToken = null;
let dynamicApiKey = null;
let questions = [];
let randomizedQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let score = 0;
let timerInterval = null;
let timeLeft = 30;
let candidateInfo = { name: '', id: '', course: '' };

// ==========================================================================
// INITIALIZATION & ANTI-CHEAT PROTECTION
// ==========================================================================
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    quizId = urlParams.get('quizId');
    sessionToken = urlParams.get('sessionToken');
    dynamicApiKey = urlParams.get('key'); // Membaca Kunci API secara dinamik dari URL

    // ANTI-CHEAT: Padam semua parameter sensitif dari address bar browser serta-merta
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    // Semak Status Sesi Terinterupsi (Internet Interruption Recovery)
    const savedState = localStorage.getItem('mind_app_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            if (parsed.quizId === quizId && parsed.status === 'IN_PROGRESS') {
                if (confirm("Sesi kuiz sebelum ini dikesan terputus. Adakah anda ingin menyambung semula?")) {
                    restoreSession(parsed);
                    return;
                } else {
                    localStorage.removeItem('mind_app_state');
                }
            }
        } catch(e) {
            console.error("Gagal memulihkan sesi lama:", e);
        }
    }

    // Jika parameter tidak lengkap, sekat kemasukan
    if (!quizId || !sessionToken || !dynamicApiKey) {
        showSplashStatus("Sesi Tidak Sah / Tamat Tempoh", "Sila dapatkan imbasan QR Code terbaharu daripada Pensyarah anda.", true);
        return;
    }

    validateSessionAndFetchQuiz();
});

function showSplashStatus(title, subtitle, isError = false) {
    const statusElement = document.getElementById('splash-status');
    if (statusElement) {
        statusElement.innerHTML = `<strong>${title}</strong><br>${subtitle}`;
    }
    if (isError) {
        const spinner = document.querySelector('.minimal-spinner');
        if (spinner) {
            spinner.style.display = 'none';
            spinner.style.backgroundColor = 'var(--danger)';
        }
    }
}

// ==========================================================================
// NETWORK API OPERATIONS
// ==========================================================================
async function validateSessionAndFetchQuiz() {
    showSplashStatus("Memvalidasi Sesi...", "Sedang memuat turun data kuiz dari pangkalan data.");
    try {
        const fetchUrl = `${WEB_APP_URL}?action=getQuiz&quizId=${encodeURIComponent(quizId)}&sessionToken=${encodeURIComponent(sessionToken)}`;
        const response = await fetch(fetchUrl);
        const data = await response.json();

        if (data.status === "success" && data.questions && data.questions.length > 0) {
            questions = data.questions;
            initQuizEngine();
            setTimeout(() => {
                switchScreen('candidate-screen');
            }, 1000);
        } else {
            showSplashStatus("Sesi Penuh Tidak Sah", data.error || "Sila hubungi pensyarah pengawas bilik kuliah.", true);
        }
    } catch(err) {
        showSplashStatus("Rangkaian Tergendala", "Sila periksa sambungan internet anda dan muat semula halaman web.", true);
    }
}

// ==========================================================================
// QUIZ ENGINE CORE (FISHER-YATES SHUFFLE)
// ==========================================================================
function initQuizEngine() {
    randomizedQuestions = [...questions];
    fisherYatesShuffle(randomizedQuestions);

    randomizedQuestions.forEach(q => {
        const options = [
            { text: q.optionA, val: 'A' },
            { text: q.optionB, val: 'B' },
            { text: q.optionC, val: 'C' },
            { text: q.optionD, val: 'D' }
        ];
        fisherYatesShuffle(options);
        
        q.shuffledOptions = options;
        const correctMapping = { 'A': q.optionA, 'B': q.optionB, 'C': q.optionC, 'D': q.optionD };
        const correctText = correctMapping[q.correctAnswer];
        
        options.forEach((opt, idx) => {
            if (opt.text === correctText) {
                const mapKeys = ['A', 'B', 'C', 'D'];
                q.newCorrectAnswer = mapKeys[idx];
            }
        });
    });
}

function fisherYatesShuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

// ==========================================================================
// CANDIDATE INTERACTION
// ==========================================================================
document.getElementById('btn-save-candidate').addEventListener('click', () => {
    const name = document.getElementById('student-name').value.trim();
    const id = document.getElementById('student-id').value.trim();
    const course = document.getElementById('student-course').value.trim();

    if(!name || !id || !course) {
        alert("Sila isi semua maklumat calon sebelum meneruskan.");
        return;
    }

    candidateInfo = { name, id, course };
    document.getElementById('student-name').disabled = true;
    document.getElementById('student-id').disabled = true;
    document.getElementById('student-course').disabled = true;
    document.getElementById('btn-save-candidate').disabled = true;
    document.getElementById('btn-save-candidate').textContent = "Saved";
    document.getElementById('btn-start-quiz').disabled = false;
});

document.getElementById('btn-start-quiz').addEventListener('click', () => {
    saveLocalState('IN_PROGRESS');
    
    // Aktifkan Pengawasan Keluar Paksa (Force Exit Anti-Cheat)
    window.addEventListener('beforeunload', forceExitHandler);
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    switchScreen('quiz-screen');
    loadQuestion();
});

// ==========================================================================
// INTERRUPTION & FORCE EXIT PROTECTION
// ==========================================================================
function saveLocalState(status) {
    const state = {
        quizId, sessionToken, dynamicApiKey, status, candidateInfo,
        questions, randomizedQuestions, currentQuestionIndex, userAnswers, score
    };
    localStorage.setItem('mind_app_state', JSON.stringify(state));
}

function restoreSession(state) {
    quizId = state.quizId;
    sessionToken = state.sessionToken;
    dynamicApiKey = state.dynamicApiKey;
    candidateInfo = state.candidateInfo;
    questions = state.questions;
    randomizedQuestions = state.randomizedQuestions;
    currentQuestionIndex = state.currentQuestionIndex;
    userAnswers = state.userAnswers;
    score = state.score;
    
    window.addEventListener('beforeunload', forceExitHandler);
    document.addEventListener('visibilitychange', visibilityChangeHandler);
    
    switchScreen('quiz-screen');
    loadQuestion();
}

function forceExitHandler(e) {
    sendForceExitBeacon();
    e.preventDefault();
    e.returnValue = "Amaran keras: Meninggalkan halaman kuiz akan merekodkan markah semasa secara paksa!";
    return e.returnValue;
}

function visibilityChangeHandler() {
    if (document.visibilityState === 'hidden') {
        sendForceExitBeacon();
    }
}

function sendForceExitBeacon() {
    const payload = {
        action: "submitResult",
        result: {
            quizId: quizId,
            studentName: candidateInfo.name,
            studentID: candidateInfo.id,
            course: candidateInfo.course,
            score: calculateCurrentPercentage(),
            timestamp: new Date().toISOString(),
            status: 'SUBMITTED_FORCED'
        }
    };
    navigator.sendBeacon(WEB_APP_URL, JSON.stringify(payload));
    localStorage.removeItem('mind_app_state');
}

function calculateCurrentPercentage() {
    const totalQ = randomizedQuestions.length;
    let correctCount = 0;
    for (let i = 0; i < totalQ; i++) {
        const qId = randomizedQuestions[i].questionText;
        if (userAnswers[qId] === randomizedQuestions[i].newCorrectAnswer) {
            correctCount++;
        }
    }
    return totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
}

// ==========================================================================
// QUIZ ENGINE FLOW MANAGEMENT
// ==========================================================================
function loadQuestion() {
    clearInterval(timerInterval);
    timeLeft = 30;
    document.getElementById('timer').textContent = timeLeft;

    if (currentQuestionIndex >= randomizedQuestions.length) {
        finishQuiz();
        return;
    }

    const q = randomizedQuestions[currentQuestionIndex];
    document.getElementById('current-q-num').textContent = currentQuestionIndex + 1;
    document.getElementById('total-q-num').textContent = randomizedQuestions.length;
    document.getElementById('question-text').textContent = q.questionText;

    const imageHolder = document.getElementById('image-holder');
    imageHolder.innerHTML = '';
    if (q.imageDriveUrl && q.imageDriveUrl.trim() !== "") {
        const img = document.createElement('img');
        img.src = q.imageDriveUrl;
        img.alt = "Imej Soalan";
        imageHolder.appendChild(img);
    }

    const ansButtons = document.querySelectorAll('.answer-btn');
    ansButtons.forEach((btn, idx) => {
        btn.classList.remove('selected');
        const optData = q.shuffledOptions[idx];
        const prefixMap = ['A', 'B', 'C', 'D'];
        
        btn.dataset.option = prefixMap[idx];
        btn.querySelector('.prefix').textContent = prefixMap[idx];
        btn.querySelector('span:not(.prefix)').textContent = optData.text;

        if (userAnswers[q.questionText] === prefixMap[idx]) {
            btn.classList.add('selected');
        }
    });

    document.getElementById('btn-confirm-answer').disabled = !userAnswers[q.questionText];
    if(currentQuestionIndex === randomizedQuestions.length - 1) {
        document.getElementById('btn-confirm-answer').textContent = "Selesai Kuiz";
    } else {
        document.getElementById('btn-confirm-answer').textContent = "Sahkan Jawapan";
    }

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert("Masa tamat untuk soalan ini! Automatik ke soalan seterusnya.");
            autoNextQuestion();
        }
    }, 1000);
}

document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
        const currentBtn = e.currentTarget;
        currentBtn.classList.add('selected');
        
        const q = randomizedQuestions[currentQuestionIndex];
        userAnswers[q.questionText] = currentBtn.dataset.option;
        
        document.getElementById('btn-confirm-answer').disabled = false;
        saveLocalState('IN_PROGRESS');
    });
});

document.getElementById('btn-confirm-answer').addEventListener('click', () => {
    const q = randomizedQuestions[currentQuestionIndex];
    if (!userAnswers[q.questionText]) {
        alert("Sila pilih satu jawapan.");
        return;
    }
    updateScoreLive();
    autoNextQuestion();
});

function updateScoreLive() {
    let currentScore = 0;
    randomizedQuestions.forEach((q, idx) => {
        if (idx < currentQuestionIndex + 1) {
            if (userAnswers[q.questionText] === q.newCorrectAnswer) {
                currentScore++;
            }
        }
    });
    document.getElementById('score-display').textContent = currentScore;
}

function autoNextQuestion() {
    currentQuestionIndex++;
    saveLocalState('IN_PROGRESS');
    loadQuestion();
}

// ==========================================================================
// RESULT PROCESSING & INTEGRATION WITH GEMINI AI
// ==========================================================================
async function finishQuiz() {
    window.removeEventListener('beforeunload', forceExitHandler);
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    clearInterval(timerInterval);
    saveLocalState('SUBMITTED');

    let totalCorrect = 0;
    randomizedQuestions.forEach(q => {
        if (userAnswers[q.questionText] === q.newCorrectAnswer) {
            totalCorrect++;
        }
    });
    score = Math.round((totalCorrect / randomizedQuestions.length) * 100);

    switchScreen('result-screen');
    document.getElementById('final-score').textContent = score;

    submitFinalResultToSheet(score);
    await generateAiAnalysisAndNotes(score, randomizedQuestions, userAnswers);
}

async function submitFinalResultToSheet(finalScore) {
    try {
        const payload = {
            action: "submitResult",
            result: {
                quizId: quizId,
                studentName: candidateInfo.name,
                studentID: candidateInfo.id,
                course: candidateInfo.course,
                score: finalScore,
                timestamp: new Date().toISOString(),
                status: 'SUBMITTED'
            }
        };
        await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        localStorage.removeItem('mind_app_state');
    } catch(e) {
        console.error("Gagal menghantar markah akhir ke pelayan:", e);
    }
}

// GEMINI AI ENGINE BERSIH 100% (Membaca dynamicApiKey dari parameter URL)
async function generateAiAnalysisAndNotes(finalScore, rQuestions, answers) {
    const wrongQuestionsList = [];
    const wrongTopicsList = [];
    const selectedAnsText = [];
    const correctAnsText = [];

    rQuestions.forEach(q => {
        const selected = answers[q.questionText] || "Tiada Jawapan";
        const correct = q.newCorrectAnswer;
        
        if (selected !== correct) {
            wrongQuestionsList.push(q.questionText);
            wrongTopicsList.push(q.questionText.substring(0, 30) + "..."); 
            selectedAnsText.push(selected);
            correctAnsText.push(correct);
        }
    });

    const promptText = `
    Anda ialah Pensyarah Pakar AI. Analisis prestasi kuiz pelajar ini.
    Tajuk Kuiz: ${rQuestions[0].quizTitle || 'Kuiz Tanpa Nama'}
    Markah Pelajar: ${finalScore}%
    Soalan Dijawab Salah: ${JSON.stringify(wrongQuestionsList)}
    Topik Soalan Salah: ${JSON.stringify(wrongTopicsList)}
    Jawapan Pelajar: ${JSON.stringify(selectedAnsText)}
    Jawapan Betul Sebenar: ${JSON.stringify(correctAnsText)}

    Tugasan:
    1. Berikan maklum balas membina (Feedback) yang ringkas dan padat.
    2. Sediakan Nota Kajian Peribadi (Personalized Study Notes) yang menerangkan konsep topik yang dijawab salah secara mendalam dan mudah difahami.
    
    Format Output:
    **Maklum Balas Prestasi:**
    [ulasan]

    **Nota Kajian Peribadi:**
    [nota]
    `;

    // Titik akhir pautan API menggunakan Kunci Dinamik yang dihantar pensyarah secara rawak
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${dynamicApiKey}`;
    const requestBody = {
        contents: [{ parts: [{ text: promptText }] }]
    };

    let attempts = 0;
    const backoffDelays = [3000, 5000, 8000, 13000]; // Exponential Backoff: 3s, 5s, 8s, 13s

    while (attempts <= backoffDelays.length) {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (response.status === 429) {
                if (attempts === backoffDelays.length) {
                    throw new Error("Had Kuota Gemini API (Rate Limit) penuh.");
                }
                await new Promise(resolve => setTimeout(resolve, backoffDelays[attempts]));
                attempts++;
                continue;
            }

            if (!response.ok) {
                throw new Error(`Ralat Respons: ${response.status}`);
            }

            const data = await response.json();
            const rawMarkdownText = data.candidates[0].content.parts[0].text;
            
            parseAndDisplayAiOutput(rawMarkdownText);
            return;

        } catch(e) {
            console.warn("Percubaan API AI tergendala. Melakukan anjakan masa undur...", e);
            if(attempts === backoffDelays.length) {
                document.getElementById('ai-feedback').textContent = "Gagal memproses maklum balas.";
                document.getElementById('ai-study-notes').textContent = "Pihak AI sibuk pada masa ini. Sila cetak keputusan dan hubungi pensyarah.";
                return;
            }
            await new Promise(resolve => setTimeout(resolve, backoffDelays[attempts]));
            attempts++;
        }
    }
}

function parseAndDisplayAiOutput(markdownText) {
    const feedbackRegex = /\*\*Maklum Balas Prestasi:\*\*([\s\S]*?)(?=\*\*Nota Kajian Peribadi:\*\*|$)/i;
    const notesRegex = /\*\*Nota Kajian Peribadi:\*\*([\s\S]*?)$/i;

    const feedbackMatch = markdownText.match(feedbackRegex);
    const notesMatch = markdownText.match(notesRegex);

    const feedbackText = feedbackMatch ? feedbackMatch[1].trim() : "Tahniah! Tiada kelemahan ketara dikesan.";
    const notesText = notesMatch ? notesMatch[1].trim() : markdownText;

    document.getElementById('ai-feedback').textContent = feedbackText;
    document.getElementById('ai-study-notes').textContent = notesText;
}

// ==========================================================================
// DOCUMENT OPERATIONS (PDF EXPORT & PRINT)
// ==========================================================================
document.getElementById('btn-download-pdf').addEventListener('click', () => {
    const element = document.getElementById('pdf-content-area');
    const opt = {
        margin:       10,
        filename:     `Nota_Minda_Kuiz_${candidateInfo.id}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
});

document.getElementById('btn-print-pdf').addEventListener('click', () => {
    window.print();
});
