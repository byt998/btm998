// =========================================================
// File: assets/js/quiz-weekly.js
// Weekly quiz logic with live ranking always visible
// =========================================================

(() => {
    const selectors = {
        intro: '[data-quiz-intro]',
        body: '[data-quiz-body]',
        summary: '[data-quiz-summary]',
        question: '[data-quiz-question]',
        answers: '[data-quiz-answers]',
        timer: '[data-quiz-timer]',
        progress: '[data-quiz-progress]',
        score: '[data-quiz-score]',
        status: '[data-quiz-status]',
        startButton: '[data-action="start-quiz"]',
        rankingTable: '[data-ranking-table]',
        rankingBody: '[data-ranking-body]',
        rankingEmpty: '[data-ranking-empty]',
        rankingLoading: '[data-ranking-loading]',
        refreshRanking: '[data-action="load-ranking"]'
    };

    const quizState = {
        supabase: null,
        user: null,
        profile: null,
        questions: [],
        currentIndex: 0,
        score: 0,
        timerId: null,
        timeLeft: 25,
        answered: false,
        weekStart: null,
        hasSubmitted: false,
        rankingIntervalId: null
    };

    const TROPHY_ICON = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 3h10v3h3a1 1 0 0 1 1 1v1a5 5 0 0 1-5 5h-1.1A5 5 0 0 1 13 16.9V19h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.1A5 5 0 0 1 9.1 13H8a5 5 0 0 1-5-5V7a1 1 0 0 1 1-1h3V3Zm-2 5a3 3 0 0 0 3 3h.2A5 5 0 0 1 7 8V8H5Zm14 0h-2v.1a5 5 0 0 1-1.2 2.9h.2a3 3 0 0 0 3-3Z"/>
        </svg>
    `.trim();

    const TROPHIES = [
        `<span class="quiz-ranking__trophy quiz-ranking__trophy--gold" title="1. miejsce">${TROPHY_ICON}</span>`,
        `<span class="quiz-ranking__trophy quiz-ranking__trophy--silver" title="2. miejsce">${TROPHY_ICON}</span>`,
        `<span class="quiz-ranking__trophy quiz-ranking__trophy--bronze" title="3. miejsce">${TROPHY_ICON}</span>`
    ];

    document.addEventListener('DOMContentLoaded', initQuizModule);

    async function initQuizModule() {
        const { supabase, getCachedProfile, refreshProfile } = window.AppCommon;

        quizState.supabase = supabase;
        quizState.profile = getCachedProfile();

        if (!quizState.supabase) {
            updateStatus('Brak konfiguracji Supabase. Skontaktuj się z administratorem.', 'error');
            return;
        }

        const sessionResponse = await quizState.supabase.auth.getSession();
        quizState.user = sessionResponse.data.session?.user ?? null;
        if (!quizState.profile && quizState.user) {
            quizState.profile = await refreshProfile(quizState.user);
        }

        quizState.weekStart = getWeekStartIso();

        const startBtn = document.querySelector(selectors.startButton);
        startBtn?.addEventListener('click', startQuiz);

        const refreshBtn = document.querySelector(selectors.refreshRanking);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                try {
                    await loadRanking();
                } finally {
                    refreshBtn.disabled = false;
                }
            });
        }

        await initializeRanking();

        if (quizState.user) {
            const eligible = await checkEligibility();
            if (!eligible) {
                disableStartButton('Quiz ukończony w tym tygodniu');
                updateStatus('Quiz ukończony w tym tygodniu. Tabela wyników poniżej.', 'info');
            }
        }
    }

    async function initializeRanking() {
        await loadRanking();
        if (quizState.rankingIntervalId) {
            clearInterval(quizState.rankingIntervalId);
        }
        quizState.rankingIntervalId = setInterval(loadRanking, 60000);
    }

    async function checkEligibility() {
        const { data, error } = await quizState.supabase
            .from('quiz_scores')
            .select('id, points')
            .eq('user_id', quizState.user.id)
            .eq('week_start', quizState.weekStart)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Nie można sprawdzić historii quizu:', error);
        }

        if (data) {
            quizState.hasSubmitted = true;
            quizState.score = data.points || 0;
            return false;
        }

        return true;
    }

    function disableStartButton(message) {
        const startBtn = document.querySelector(selectors.startButton);
        if (!startBtn) {
            return;
        }
        startBtn.textContent = message;
        startBtn.disabled = true;
        startBtn.classList.add('btn--disabled');
    }

    function updateStatus(message, type = 'info') {
        const statusEl = document.querySelector(selectors.status);
        if (!statusEl) {
            return;
        }
        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            statusEl.className = 'quiz-area__status';
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.className = `quiz-area__status quiz-area__status--${type}`;
    }

    async function startQuiz() {
        if (quizState.hasSubmitted) {
            updateStatus('Quiz ukończony w tym tygodniu. Tabela wyników poniżej.', 'info');
            return;
        }

        if (!quizState.user) {
            updateStatus('Zaloguj się, aby wziąć udział w quizie.', 'error');
            return;
        }

        const eligible = await checkEligibility();
        if (!eligible) {
            updateStatus('Quiz ukończony w tym tygodniu. Tabela wyników poniżej.', 'info');
            return;
        }

        updateStatus('Pobieram pytania...', 'info');
        quizState.questions = await loadQuestions();

        if (!quizState.questions.length) {
            updateStatus('Brak dostępnych pytań. Skontaktuj się z administratorem.', 'error');
            return;
        }

        quizState.currentIndex = 0;
        quizState.score = 0;

        showQuizBody();
        updateStatus('');
        showQuestion();
    }

    async function loadQuestions() {
        const { data, error } = await quizState.supabase
            .from('quiz_questions')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error('Error loading questions', error);
            return [];
        }

        const shuffled = shuffleArray(data || []);
        return shuffled.slice(0, 10);
    }

    function showQuizBody() {
        document.querySelector(selectors.intro)?.setAttribute('hidden', 'true');
        document.querySelector(selectors.summary)?.setAttribute('hidden', 'true');
        const body = document.querySelector(selectors.body);
        if (body) {
            body.hidden = false;
        }
    }

    function showQuestion() {
        const question = quizState.questions[quizState.currentIndex];
        if (!question) {
            finishQuiz();
            return;
        }

        const questionEl = document.querySelector(selectors.question);
        const answersEl = document.querySelector(selectors.answers);
        const progressEl = document.querySelector(selectors.progress);

        questionEl.textContent = question.question;
        progressEl.textContent = `${quizState.currentIndex + 1} / ${quizState.questions.length}`;

        answersEl.innerHTML = '';
        ['a', 'b', 'c', 'd', 'e'].forEach((optionKey) => {
            const optionText = question[`answer_${optionKey}`];
            if (!optionText) {
                return;
            }
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'quiz-answer';
            button.dataset.option = optionKey;
            button.innerHTML = `<span>${optionKey.toUpperCase()}.</span>${optionText}`;
            button.addEventListener('click', () => handleAnswer(optionKey));
            li.appendChild(button);
            answersEl.appendChild(li);
        });

        quizState.answered = false;
        quizState.timeLeft = 25;
        updateTimerDisplay();
        clearInterval(quizState.timerId);
        quizState.timerId = setInterval(handleTick, 1000);
    }

    function handleAnswer(option) {
        if (quizState.answered) {
            return;
        }
        quizState.answered = true;
        const question = quizState.questions[quizState.currentIndex];
        highlightAnswers(option, question.correct_option);
        if (option === question.correct_option) {
            quizState.score += 1;
        }
        proceedNext();
    }

    function handleTick() {
        quizState.timeLeft -= 1;
        updateTimerDisplay();
        if (quizState.timeLeft <= 0) {
            clearInterval(quizState.timerId);
            quizState.answered = true;
            highlightAnswers(null, quizState.questions[quizState.currentIndex].correct_option);
            proceedNext();
        }
    }

    function updateTimerDisplay() {
        const timerEl = document.querySelector(selectors.timer);
        if (timerEl) {
            timerEl.textContent = `${quizState.timeLeft} s`;
        }
    }

    function highlightAnswers(selected, correct) {
        const buttons = document.querySelectorAll('.quiz-answer');
        buttons.forEach((button) => {
            const option = button.dataset.option;
            button.disabled = true;
            if (option === correct) {
                button.classList.add('quiz-answer--correct');
            }
            if (selected && option === selected && selected !== correct) {
                button.classList.add('quiz-answer--incorrect');
            }
        });
    }

    function proceedNext() {
        clearInterval(quizState.timerId);
        setTimeout(() => {
            quizState.currentIndex += 1;
            if (quizState.currentIndex >= quizState.questions.length) {
                finishQuiz();
            } else {
                showQuestion();
            }
        }, 600);
    }

    async function finishQuiz() {
        clearInterval(quizState.timerId);
        document.querySelector(selectors.body)?.setAttribute('hidden', 'true');
        const summary = document.querySelector(selectors.summary);
        if (summary) {
            summary.hidden = false;
        }
        const scoreEl = document.querySelector(selectors.score);
        scoreEl.textContent = `Zdobyłeś ${quizState.score} / ${quizState.questions.length} punktów.`;

        disableStartButton('Quiz ukończony w tym tygodniu');
        updateStatus('Zapisuję wynik...', 'info');

        await autoSubmitScore();
        await loadRanking();

        updateStatus('Quiz ukończony. Tabela wyników została zaktualizowana.', 'success');
    }

    async function autoSubmitScore() {
        if (quizState.hasSubmitted) {
            return;
        }
        if (!quizState.user) {
            updateStatus('Nie można zapisać wyniku – brak zalogowanego użytkownika.', 'error');
            return;
        }

        const payload = {
            user_id: quizState.user.id,
            user_name: getDisplayName(),
            week_start: quizState.weekStart,
            points: quizState.score,
            played_at: new Date().toISOString()
        };

        const { error } = await quizState.supabase
            .from('quiz_scores')
            .upsert(payload, { onConflict: 'user_id,week_start' });

        if (error) {
            console.error('Error inserting score', error);
            updateStatus('Nie udało się zapisać wyniku. Spróbuj ponownie później.', 'error');
            return;
        }

        quizState.hasSubmitted = true;
    }

    function getDisplayName() {
        if (quizState.profile) {
            const name = `${quizState.profile.firstName || ''} ${quizState.profile.lastName || ''}`.trim();
            if (name) {
                return name;
            }
        }
        if (quizState.user?.email) {
            return quizState.user.email;
        }
        return 'Nieznany użytkownik';
    }

    async function loadRanking() {
        const tableWrapper = document.querySelector(selectors.rankingTable);
        const tbody = document.querySelector(selectors.rankingBody);
        const empty = document.querySelector(selectors.rankingEmpty);
        const loading = document.querySelector(selectors.rankingLoading);

        if (!tableWrapper || !tbody) {
            return;
        }

        if (loading) {
            loading.hidden = false;
        }
        if (empty) {
            empty.hidden = true;
        }

        tableWrapper.hidden = false;

        const { data, error } = await quizState.supabase
            .from('quiz_scores')
            .select('user_id, user_name, points')
            .order('user_name', { ascending: true });

        if (loading) {
            loading.hidden = true;
        }

        if (error) {
            console.error('Error loading ranking', error);
            updateStatus('Nie udało się pobrać tabeli wyników.', 'error');
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = '';
            if (empty) {
                empty.hidden = false;
            }
            return;
        }

        const aggregated = aggregateScores(data);
        tbody.innerHTML = '';

        const currentUserId = quizState.user?.id || null;

        aggregated.forEach((entry, index) => {
            const row = document.createElement('tr');
            const trophy = TROPHIES[index] || '';
            const isCurrentUser = Boolean(currentUserId && entry.user_id === currentUserId);
            const displayName = isCurrentUser ? 'Ty' : '---------';

            if (isCurrentUser) {
                row.classList.add('quiz-ranking__row--me');
            }

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${trophy}${displayName}</td>
                <td>${entry.points}</td>
            `;
            tbody.appendChild(row);
        });
    }

    function aggregateScores(rows) {
        const map = new Map();
        rows.forEach((row, index) => {
            const key = row.user_id || row.user_name || `anonymous_${index}`;
            const current = map.get(key) || {
                user_id: row.user_id || null,
                user_name: row.user_name || 'Nieznany użytkownik',
                points: 0
            };
            current.points += row.points || 0;
            map.set(key, current);
        });
        return Array.from(map.values())
            .sort((a, b) => b.points - a.points);
    }

    function getWeekStartIso(date = new Date()) {
        const day = (date.getDay() + 6) % 7;
        const monday = new Date(date);
        monday.setHours(0, 0, 0, 0);
        monday.setDate(monday.getDate() - day);
        return monday.toISOString().slice(0, 10);
    }

    function shuffleArray(array) {
        const clone = [...array];
        for (let i = clone.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [clone[i], clone[j]] = [clone[j], clone[i]];
        }
        return clone;
    }
})();
