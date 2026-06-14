// Konfigurasi Sistem (Sila kemas kini nilai di sini)
const GEMINI_API_KEY = "MASUKKAN_GEMINI_API_KEY_ANDA_DI_SINI";
const WEB_APP_URL = "MASUKKAN_APPS_SCRIPT_WEB_APP_URL_DI_SINI";

let quizId = null;
let sessionToken = null;
let questions = [];
let randomizedQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let score = 0;
let timerInterval = null;
let timeLeft = 30;
let candidateInfo = { name: '', id: '', course: '' };

// Inisialisasi parameter URL Web Pelajar
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    quizId = urlParams.get('quizId');
    sessionToken = urlParams.get('sessionToken');

    // Anti-Cheat: Buang parameter dari address bar untuk keselamatan
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    // Semak Recovery State (Sesi Interupsi / Sambung Semula)
    const savedState = localStorage.getItem('mind_app_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            // Jika quizId sama & status belum selesai sepenuhnya (seperti IN_PROGRESS dalam simpanan tempatan)
            if (parsed.quizId === quizId && parsed.status === 'IN_PROGRESS') {
                if (confirm("Sesi kuiz sebelumnya dikesan. Adakah anda ingin menyambung semula?")) {
                    restoreSession(parsed);
                    return;
                } else {
                    localStorage.removeItem('mind_app_state');
                }
            }
        } catch(e) {
            console.error("Gagal membaca state", e);
        }
    }

    if (!quizId || !sessionToken) {
        showSplashStatus("Pautan Sesi Tidak Sah", "Sila imbas semula QR Code yang dibekalkan oleh Pensyarah anda.", true);
        return;
    }

    validateSessionAndFetchQuiz();
});

function showSplashStatus(title, subtitle, isError = false) {
    document.getElementById('splash-status').innerHTML = `<strong>${title}</strong><br>${subtitle}`;
    if (isError) {
        document.querySelector('.minimal-spinner').style.display = 'none';
        document.querySelector('.minimal-spinner').style.backgroundColor = 'var(--danger)';
    }
}

async function validateSessionAndFetchQuiz() {
    showSplashStatus("Memvalidasi Sesi...", "Menghubungi pangkalan data pensyarah.");
    try {
        const fetchUrl = `${WEB_APP_URL}?action=getQuiz&quizId=${encodeURIComponent(quizId)}&sessionToken=${encodeURIComponent(sessionToken)}`;
        const response = await fetch(fetchUrl);
        const data = await response.json();

        if (data.status === "success" && data.questions && data.questions.length > 0) {
            questions = data.questions;
            // Persiapan Sesi Kuiz - Rawak Soalan (Fisher-Yates Shuffle)
            initQuizEngine();
            setTimeout(() => {
                switchScreen('candidate-screen');
            }, 1000);
        } else {
            showSplashStatus("Sesi Tidak Sah", data.error || "Sila imbas QR code yang sah atau hubungi pensyarah.", true);
        }
    } catch(err) {
        showSplashStatus("Rangkaian Tergendala", "Sila periksa sambungan internet anda dan muat semula halaman.", true);
    }
}

function initQuizEngine() {
    randomizedQuestions = [...questions];
    fisherYatesShuffle(randomizedQuestions);

    // Rawak pilihan A, B, C, D untuk setiap soalan (Kekalkan padanan jawapan betul)
    randomizedQuestions.forEach(q => {
        const options = [
            { text: q.optionA, val: 'A' },
            { text: q.optionB, val: 'B' },
            { text: q.optionC, val: 'C' },
            { text: q.optionD, val: 'D' }
        ];
        fisherYatesShuffle(options);
        
        // Simpan semula susunan opsyen yang diubah bersama jawapan betul baharu
        q.shuffledOptions = options;
        const correctMapping = { 'A': q.optionA, 'B': q.optionB, 'C': q.optionC, 'D': q.optionD };
        const correctText = correctMapping[q.correctAnswer];
        
        // Cari abjad baharu untuk jawapan betul dalam pilihan rawak
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
    document.getElementById(screenId).classList.add('active');
}

// Interaksi Calon
document.getElementById('btn-save-candidate').addEventListener('click', () => {
    const name = document.getElementById('student-name').value.trim();
    const id = document.getElementById('student-id').value.trim();
    const course = document.getElementById('student-course').value.trim();

    if(!name || !id || !course) {
        alert("Sila lengkapkan semua maklumat calon.");
        return;
    }

    candidateInfo = { name, id, course };
    document.getElementById('student-name').disabled = true;
    document.getElementById('student-id').disabled = true;
    document.getElementById('student-course').disabled = true;
    document.getElementById('btn-save-candidate').disabled = true;
    document.getElementById('btn-start-quiz').disabled = false;
    alert("Maklumat disimpan. Anda kini boleh memulakan kuiz.");
});

document.getElementById('btn-start-quiz').addEventListener('click', () => {
    // Simpan local state sbg sokongan tergendala internet
    saveLocalState('IN_PROGRESS');
    
    // Pasang Event Listener Anti-Keluar (Force Exit Protection)
    window.addEventListener('beforeunload', forceExitHandler);
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    switchScreen('quiz-screen');
    loadQuestion();
});

function saveLocalState(status) {
    const state = {
        quizId, sessionToken, status, candidateInfo,
        questions, randomizedQuestions, currentQuestionIndex, userAnswers, score
    };
    localStorage.setItem('mind_app_state', JSON.stringify(state));
}

function restoreSession(state) {
    quizId = state.quizId;
    sessionToken = state.sessionToken;
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
    // Hantar markah semasa ke pangkalan data menggunakan navigator.sendBeacon
    sendForceExitBeacon();
    e.preventDefault();
    e.returnValue = "Amaran: Anda akan meninggalkan kuiz. Markah semasa anda akan direkodkan secara paksa!";
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

// Logik Enjin Kuiz & UI
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

    // Paparan Imej Soalan
    const imageHolder = document.getElementById('image-holder');
    imageHolder.innerHTML = '';
    if (q.imageDriveUrl && q.imageDriveUrl.trim() !== "") {
        const img = document.createElement('img');
        img.src = q.imageDriveUrl;
        img.alt = "Imej Soalan";
        imageHolder.appendChild(img);
    }

    // Paparan Pilihan Jawapan Rawak
    const ansButtons = document.querySelectorAll('.answer-btn');
    ansButtons.forEach((btn, idx) => {
        btn.classList.remove('selected');
        const optData = q.shuffledOptions[idx];
        const prefixMap = ['A', 'B', 'C', 'D'];
        
        // Tetapkan huruf paparan dan teksnya
        btn.dataset.option = prefixMap[idx];
        btn.querySelector('.prefix').textContent = prefixMap[idx];
        btn.querySelector('span:not(.prefix)').textContent = optData.text;

        // Semak status jika sudah dijawab (Sokongan penyerahan ulangan / interupsi)
        if (userAnswers[q.questionText] === prefixMap[idx]) {
            btn.classList.add('selected');
        }
    });

    // Kendali butang
    document.getElementById('btn-confirm-answer').disabled = !userAnswers[q.questionText];
    if(currentQuestionIndex === randomizedQuestions.length - 1) {
        document.getElementById('btn-confirm-answer').textContent = "Selesai Kuiz";
    }

    // Pemasa Undur 30 Saat
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert("Masa untuk soalan ini tamat!");
            autoNextQuestion();
        }
    }, 1000);
}

document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
        // Dapatkan elemen butang asas secara mutlak
        const currentBtn = e.currentTarget;
        currentBtn.classList.add('selected');
        
        const q = randomizedQuestions[currentQuestionIndex];
        userAnswers[q.questionText] = currentBtn.dataset.option;
        
        document.getElementById('btn-confirm-answer').disabled = false;
        
        // Simpan State Tempatan
        saveLocalState('IN_PROGRESS');
    });
});

document.getElementById('btn-confirm-answer').addEventListener('click', () => {
    const q = randomizedQuestions[currentQuestionIndex];
    if (!userAnswers[q.questionText]) {
        alert("Sila pilih jawapan terlebih dahulu.");
        return;
    }
    
    // Logik Markah Terkini
    updateScoreLive();
    
    // Pergi ke soalan seterusnya secara automatik
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

async function finishQuiz() {
    // Bersihkan pendengar force exit
    window.removeEventListener('beforeunload', forceExitHandler);
    document.removeEventListener('visibilitychange', visibilityChangeHandler);

    clearInterval(timerInterval);
    saveLocalState('SUBMITTED');

    // Kira markah akhir
    let totalCorrect = 0;
    randomizedQuestions.forEach(q => {
        if (userAnswers[q.questionText] === q.newCorrectAnswer) {
            totalCorrect++;
        }
    });
    score = Math.round((totalCorrect / randomizedQuestions.length) * 100);

    // Paparan Skrin Keputusan
    switchScreen('result-screen');
    document.getElementById('final-score').textContent = score;

    // Hantar Data ke Pelayan Pangkalan Data Sheets melalui API
    submitFinalResultToSheet(score);

    // Jana Analisis & Nota Menggunakan Gemini AI
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
        // Bersihkan state dari LocalStorage
        localStorage.removeItem('mind_app_state');
    } catch(e) {
        console.error("Gagal menyimpan markah terus ke pangkalan data", e);
    }
}

// Gemini AI Integration berserta Rate Limit Exponential Backoff (HTTP 429)
async function generateAiAnalysisAndNotes(finalScore, rQuestions, answers) {
    // Sediakan payload data salah, topik salah dan pilihan/jawapan betul untuk dihantar kepada Gemini API
    const wrongQuestionsList = [];
    const wrongTopicsList = [];
    const selectedAnsText = [];
    const correctAnsText = [];

    rQuestions.forEach(q => {
        const selected = answers[q.questionText] || "Tiada Jawapan";
        const correct = q.newCorrectAnswer;
        
        if (selected !== correct) {
            wrongQuestionsList.push(q.questionText);
            wrongTopicsList.push(q.questionText.substring(0, 30) + "..."); // Anggaran topik soalan
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

    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const requestBody = {
        contents: [{ parts: [{ text: promptText }] }]
    };

    let attempts = 0;
    const backoffDelays = [3000, 5000, 8000, 13000]; // Exponential Backoff (3s, 5s, 8s, 13s)

    while (attempts <= backoffDelays.length) {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (response.status === 429) {
                if (attempts === backoffDelays.length) {
                    throw new Error("Had Kuota AI (Rate Limit 429) telah dicapai. Sila cuba sebentar lagi.");
                }
                // Tunggu berdasarkan backoff delay
                await new Promise(resolve => setTimeout(resolve, backoffDelays[attempts]));
                attempts++;
                continue;
            }

            if (!response.ok) {
                throw new Error(`Ralat API AI: ${response.status}`);
            }

            const data = await response.json();
            const rawMarkdownText = data.candidates[0].content.parts[0].text;
            
            // Format output pembersihan markdown mudah kepada HTML
            parseAndDisplayAiOutput(rawMarkdownText);
            return;

        } catch(e) {
            console.error("Percubaan Gemini API gagal. Melakukan backoff...", e);
            if(attempts === backoffDelays.length) {
                document.getElementById('ai-feedback').textContent = "Gagal mendapatkan maklum balas.";
                document.getElementById('ai-study-notes').textContent = "Sistem gagal mengakses AI kerana had kuota percuma. Sila muat semula atau hubungi pensyarah.";
                return;
            }
            await new Promise(resolve => setTimeout(resolve, backoffDelays[attempts]));
            attempts++;
        }
    }
}

function parseAndDisplayAiOutput(markdownText) {
    // Pembersihan teks asas untuk memaparkan format analisis AI
    const feedbackRegex = /\*\*Maklum Balas Prestasi:\*\*([\s\S]*?)(?=\*\*Nota Kajian Peribadi:\*\*|$)/i;
    const notesRegex = /\*\*Nota Kajian Peribadi:\*\*([\s\S]*?)$/i;

    const feedbackMatch = markdownText.match(feedbackRegex);
    const notesMatch = markdownText.match(notesRegex);

    const feedbackText = feedbackMatch ? feedbackMatch[1].trim() : "Prestasi cemerlang atau tiada maklum balas dijana.";
    const notesText = notesMatch ? notesMatch[1].trim() : markdownText;

    document.getElementById('ai-feedback').textContent = feedbackText;
    document.getElementById('ai-study-notes').textContent = notesText;
}

// PDF Export Logik
document.getElementById('btn-download-pdf').addEventListener('click', () => {
    const element = document.getElementById('pdf-content-area');
    const opt = {
        margin:       10,
        filename:     `Nota_Kajian_${candidateInfo.id}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
});

document.getElementById('btn-print-pdf').addEventListener('click', () => {
    window.print();
});
