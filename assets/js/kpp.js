// =========================================================
// File: assets/js/kpp.js
// Modul KPP: tryb nauki pytan i test z timerem
// =========================================================

(() => {
    const STORAGE_KEY = 'kppTestState';
    const TEST_QUESTION_LIMIT = 30;
    const TEST_TIME_LIMIT = 60;
    const ANSWER_KEYS = ['a', 'b', 'c', 'd', 'e'];

    const selectors = {
        entry: '[data-kpp-entry]',
        session: '[data-kpp-session]',
        result: '[data-kpp-result]',
        status: '[data-kpp-status]',
        modeLabel: '[data-kpp-mode-label]',
        progress: '[data-kpp-progress]',
        errors: '[data-kpp-errors]',
        timer: '[data-kpp-timer]',
        questionCount: '[data-kpp-question-count]',
        questionText: '[data-kpp-question-text]',
        answers: '[data-kpp-answers]',
        wrongListWrap: '[data-kpp-wrong-list-wrap]',
        wrongList: '[data-kpp-wrong-list]',
        resultStatus: '[data-kpp-result-status]',
        resultTitle: '[data-kpp-result-title]',
        correctCount: '[data-kpp-correct-count]',
        wrongCount: '[data-kpp-wrong-count]',
        previousButton: '[data-kpp-action="previous-question"]',
        nextButton: '[data-kpp-action="next-question"]',
        modeButtons: '[data-kpp-mode]',
        actionButtons: '[data-kpp-action]'
    };

    const state = {
        supabase: null,
        questions: [],
        mode: null,
        study: {
            index: 0,
            answers: []
        },
        test: {
            questions: [],
            index: 0,
            results: [],
            timerId: null,
            deadlineAt: null,
            currentTimeoutId: null
        }
    };

    document.addEventListener('DOMContentLoaded', initKppModule);

    async function initKppModule() {
        state.supabase = window.AppCommon?.supabase || null;
        bindEvents();

        if (!state.supabase) {
            updateStatus('Brak konfiguracji Supabase. Moduł KPP nie może pobrać pytań.', 'error');
            return;
        }

        updateStatus('Ładowanie pytań...', 'info');
        state.questions = await loadQuestions();

        if (!state.questions.length) {
            updateStatus('Brak aktywnych pytań w bazie `kpp_questions`.', 'error');
            return;
        }

        updateStatus('');
        restoreTestSessionIfNeeded();
    }

    function bindEvents() {
        document.querySelectorAll(selectors.modeButtons).forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.getAttribute('data-kpp-mode');
                if (mode === 'study') {
                    startStudyMode();
                }
                if (mode === 'test') {
                    startTestMode(true);
                }
            });
        });

        document.querySelectorAll(selectors.actionButtons).forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-kpp-action');
                if (action === 'previous-question') {
                    goToPreviousStudyQuestion();
                }
                if (action === 'next-question') {
                    goToNextStudyQuestion();
                }
                if (action === 'restart-test') {
                    startTestMode(true);
                }
                if (action === 'back-to-menu') {
                    showEntryScreen();
                }
            });
        });
    }

    async function loadQuestions() {
        const { data, error } = await state.supabase
            .from('kpp_questions')
            .select('id, question_text, answer_a, answer_b, answer_c, answer_d, answer_e, correct_answer, sort_order, is_active, created_at')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true });

        if (error) {
            console.error('KPP: nie udalo sie pobrac pytan', error);
            return [];
        }

        return (data || []).map(normalizeQuestion).filter((question) => ANSWER_KEYS.includes(question.correctAnswer));
    }

    function normalizeQuestion(row) {
        return {
            id: row.id,
            text: row.question_text,
            sortOrder: row.sort_order,
            correctAnswer: String(row.correct_answer || '').toLowerCase(),
            options: ANSWER_KEYS.reduce((acc, key) => {
                acc[key] = row[`answer_${key}`];
                return acc;
            }, {})
        };
    }

    function startStudyMode() {
        clearTestTimers();
        clearStoredTestSession();
        state.mode = 'study';
        state.study.index = 0;
        state.study.answers = state.questions.map(() => null);
        showSessionScreen();
        renderStudyQuestion();
    }

    function renderStudyQuestion() {
        const question = state.questions[state.study.index];
        if (!question) {
            showEntryScreen('To był ostatni element w trybie Pytania.', 'success');
            return;
        }

        const answerRecord = state.study.answers[state.study.index];
        renderQuestionCommon({
            modeLabel: 'Pytania',
            questionIndex: state.study.index,
            questionTotal: state.questions.length,
            question,
            answerRecord,
            showTimer: false,
            showErrors: false,
            answerHandler: handleStudyAnswer
        });

        const previousButton = document.querySelector(selectors.previousButton);
        const nextButton = document.querySelector(selectors.nextButton);
        if (previousButton) {
            previousButton.hidden = false;
            previousButton.disabled = state.study.index === 0;
        }
        if (nextButton) {
            nextButton.hidden = false;
            nextButton.disabled = !answerRecord;
            nextButton.textContent = state.study.index === state.questions.length - 1 ? 'Zakończ' : 'Następne';
        }
    }

    function handleStudyAnswer(answerKey) {
        const current = state.study.answers[state.study.index];
        if (current) {
            return;
        }

        const question = state.questions[state.study.index];
        const isCorrect = answerKey === question.correctAnswer;
        state.study.answers[state.study.index] = {
            selectedAnswer: answerKey,
            isCorrect
        };
        renderStudyQuestion();
    }

    function goToPreviousStudyQuestion() {
        if (state.mode !== 'study' || state.study.index === 0) {
            return;
        }
        state.study.index -= 1;
        renderStudyQuestion();
    }

    function goToNextStudyQuestion() {
        if (state.mode !== 'study') {
            return;
        }
        if (!state.study.answers[state.study.index]) {
            return;
        }
        state.study.index += 1;
        renderStudyQuestion();
    }

    function startTestMode(forceRestart = false) {
        if (forceRestart) {
            clearStoredTestSession();
        }
        clearTestTimers();
        state.mode = 'test';
        state.test.index = 0;
        state.test.results = [];
        state.test.questions = shuffleArray(state.questions).slice(0, Math.min(TEST_QUESTION_LIMIT, state.questions.length));
        state.test.deadlineAt = null;
        showSessionScreen();
        renderTestQuestion();
    }

    function renderTestQuestion() {
        const question = state.test.questions[state.test.index];
        if (!question) {
            finishTest();
            return;
        }

        renderQuestionCommon({
            modeLabel: 'Test',
            questionIndex: state.test.index,
            questionTotal: state.test.questions.length,
            question,
            answerRecord: null,
            showTimer: true,
            showErrors: true,
            answerHandler: handleTestAnswer
        });

        const previousButton = document.querySelector(selectors.previousButton);
        const nextButton = document.querySelector(selectors.nextButton);
        if (previousButton) {
            previousButton.hidden = true;
        }
        if (nextButton) {
            nextButton.hidden = true;
        }

        startTimer();
        persistTestSession();
    }

    function handleTestAnswer(answerKey) {
        if (hasAnsweredCurrentTestQuestion()) {
            return;
        }

        const question = state.test.questions[state.test.index];
        const isCorrect = answerKey === question.correctAnswer;
        recordTestResult(question, answerKey, isCorrect, false);
        highlightAnswers(answerKey, question.correctAnswer);
        queueNextTestQuestion();
    }

    function handleTestTimeout() {
        if (hasAnsweredCurrentTestQuestion()) {
            return;
        }

        const question = state.test.questions[state.test.index];
        recordTestResult(question, null, false, true);
        highlightAnswers(null, question.correctAnswer);
        queueNextTestQuestion();
    }

    function queueNextTestQuestion() {
        clearTestTimers();
        persistTestSession();
        state.test.currentTimeoutId = window.setTimeout(() => {
            state.test.index += 1;
            renderTestQuestion();
        }, 700);
    }

    function recordTestResult(question, selectedAnswer, isCorrect, isTimeout) {
        state.test.results.push({
            questionId: question.id,
            questionText: question.text,
            selectedAnswer,
            selectedAnswerText: selectedAnswer ? question.options[selectedAnswer] : '',
            correctAnswer: question.correctAnswer,
            correctAnswerText: question.options[question.correctAnswer],
            isCorrect,
            isTimeout
        });
    }

    function hasAnsweredCurrentTestQuestion() {
        return state.test.results.length > state.test.index;
    }

    function startTimer() {
        clearTestTimers();
        state.test.deadlineAt = Date.now() + TEST_TIME_LIMIT * 1000;
        updateTimerDisplay();
        state.test.timerId = window.setInterval(() => {
            updateTimerDisplay();
            if (Date.now() >= state.test.deadlineAt) {
                handleTestTimeout();
            }
        }, 250);
    }

    function updateTimerDisplay() {
        const timerElement = document.querySelector(selectors.timer);
        if (!timerElement || !state.test.deadlineAt) {
            return;
        }
        const secondsLeft = Math.max(0, Math.ceil((state.test.deadlineAt - Date.now()) / 1000));
        timerElement.textContent = `Pozostało: ${secondsLeft} s`;
    }

    function renderQuestionCommon({
        modeLabel,
        questionIndex,
        questionTotal,
        question,
        answerRecord,
        showTimer,
        showErrors,
        answerHandler
    }) {
        const modeLabelElement = document.querySelector(selectors.modeLabel);
        const progressElement = document.querySelector(selectors.progress);
        const errorsElement = document.querySelector(selectors.errors);
        const timerElement = document.querySelector(selectors.timer);
        const questionCountElement = document.querySelector(selectors.questionCount);
        const questionTextElement = document.querySelector(selectors.questionText);
        const answersElement = document.querySelector(selectors.answers);

        if (modeLabelElement) {
            modeLabelElement.textContent = modeLabel;
        }
        if (progressElement) {
            progressElement.textContent = `${questionIndex + 1} / ${questionTotal}`;
        }
        if (questionCountElement) {
            questionCountElement.textContent = `Pytanie ${questionIndex + 1}`;
        }
        if (questionTextElement) {
            questionTextElement.textContent = question.text;
        }
        if (errorsElement) {
            errorsElement.hidden = !showErrors;
            if (showErrors) {
                errorsElement.textContent = `Błędy: ${getWrongCount()}`;
            }
        }
        if (timerElement) {
            timerElement.hidden = !showTimer;
        }

        if (!answersElement) {
            return;
        }

        answersElement.innerHTML = '';

        ANSWER_KEYS.forEach((answerKey) => {
            const optionText = question.options[answerKey];
            if (!optionText) {
                return;
            }

            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kpp-answer';
            button.dataset.answer = answerKey;
            button.innerHTML = `
                <span class="kpp-answer__key">${answerKey.toUpperCase()}</span>
                <span>${optionText}</span>
            `;

            if (answerRecord) {
                button.disabled = true;
                applyAnswerClasses(button, answerKey, answerRecord.selectedAnswer, question.correctAnswer);
            } else {
                button.addEventListener('click', () => answerHandler(answerKey));
            }

            li.appendChild(button);
            answersElement.appendChild(li);
        });
    }

    function applyAnswerClasses(button, answerKey, selectedAnswer, correctAnswer) {
        if (answerKey === correctAnswer) {
            button.classList.add('kpp-answer--correct');
        }
        if (selectedAnswer && answerKey === selectedAnswer && selectedAnswer !== correctAnswer) {
            button.classList.add('kpp-answer--incorrect');
        }
        if (selectedAnswer && answerKey !== selectedAnswer && answerKey !== correctAnswer) {
            button.classList.add('kpp-answer--muted');
        }
    }

    function highlightAnswers(selectedAnswer, correctAnswer) {
        document.querySelectorAll('.kpp-answer').forEach((button) => {
            const answerKey = button.getAttribute('data-answer');
            button.disabled = true;
            applyAnswerClasses(button, answerKey, selectedAnswer, correctAnswer);
        });
    }

    function finishTest() {
        clearTestTimers();
        clearStoredTestSession();

        const correctCount = state.test.results.filter((entry) => entry.isCorrect).length;
        const wrongEntries = state.test.results.filter((entry) => !entry.isCorrect);
        const isPassed = wrongEntries.length <= 3;

        const resultStatusElement = document.querySelector(selectors.resultStatus);
        const resultTitleElement = document.querySelector(selectors.resultTitle);
        const correctCountElement = document.querySelector(selectors.correctCount);
        const wrongCountElement = document.querySelector(selectors.wrongCount);
        const wrongListWrap = document.querySelector(selectors.wrongListWrap);
        const wrongList = document.querySelector(selectors.wrongList);

        if (resultStatusElement) {
            resultStatusElement.textContent = isPassed ? 'Test zdany' : 'Test niezdany';
            resultStatusElement.classList.toggle('is-passed', isPassed);
            resultStatusElement.classList.toggle('is-failed', !isPassed);
        }
        if (resultTitleElement) {
            resultTitleElement.textContent = `Wynik końcowy: ${correctCount} poprawnych z ${state.test.results.length}`;
        }
        if (correctCountElement) {
            correctCountElement.textContent = String(correctCount);
        }
        if (wrongCountElement) {
            wrongCountElement.textContent = String(wrongEntries.length);
        }
        if (wrongList) {
            wrongList.innerHTML = wrongEntries.map(renderWrongResultItem).join('');
        }
        if (wrongListWrap) {
            wrongListWrap.hidden = wrongEntries.length === 0;
        }

        showScreen('result');
    }

    function renderWrongResultItem(entry) {
        const userAnswer = entry.selectedAnswer
            ? `${entry.selectedAnswer.toUpperCase()}. ${escapeHtml(entry.selectedAnswerText)}`
            : 'Brak odpowiedzi';
        const correctAnswer = `${entry.correctAnswer.toUpperCase()}. ${escapeHtml(entry.correctAnswerText)}`;

        return `
            <article class="kpp-result__wrong-item">
                <p class="kpp-result__wrong-question">${escapeHtml(entry.questionText)}</p>
                <div class="kpp-result__wrong-grid">
                    <p><strong>Twoja odpowiedź:</strong> ${userAnswer}</p>
                    <p><strong>Poprawna odpowiedź:</strong> ${correctAnswer}</p>
                </div>
            </article>
        `.trim();
    }

    function persistTestSession() {
        if (state.mode !== 'test') {
            return;
        }

        const payload = {
            mode: 'test',
            questions: state.test.questions,
            index: state.test.index,
            results: state.test.results,
            deadlineAt: state.test.deadlineAt
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function restoreTestSessionIfNeeded() {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }

        try {
            const parsed = JSON.parse(raw);
            if (parsed?.mode !== 'test' || !Array.isArray(parsed.questions) || !parsed.questions.length) {
                clearStoredTestSession();
                return;
            }

            state.mode = 'test';
            state.test.questions = parsed.questions;
            state.test.index = Number.isInteger(parsed.index) ? parsed.index : 0;
            state.test.results = Array.isArray(parsed.results) ? parsed.results : [];
            state.test.deadlineAt = typeof parsed.deadlineAt === 'number' ? parsed.deadlineAt : Date.now() + TEST_TIME_LIMIT * 1000;

            if (state.test.index >= state.test.questions.length) {
                finishTest();
                return;
            }

            if (state.test.results.length > state.test.index) {
                state.test.index += 1;
                if (state.test.index >= state.test.questions.length) {
                    finishTest();
                    return;
                }
                state.test.deadlineAt = Date.now() + TEST_TIME_LIMIT * 1000;
            }

            showSessionScreen();
            renderQuestionCommon({
                modeLabel: 'Test',
                questionIndex: state.test.index,
                questionTotal: state.test.questions.length,
                question: state.test.questions[state.test.index],
                answerRecord: null,
                showTimer: true,
                showErrors: true,
                answerHandler: handleTestAnswer
            });

            const previousButton = document.querySelector(selectors.previousButton);
            const nextButton = document.querySelector(selectors.nextButton);
            if (previousButton) {
                previousButton.hidden = true;
            }
            if (nextButton) {
                nextButton.hidden = true;
            }

            if (Date.now() >= state.test.deadlineAt) {
                handleTestTimeout();
                return;
            }

            updateTimerDisplay();
            state.test.timerId = window.setInterval(() => {
                updateTimerDisplay();
                if (Date.now() >= state.test.deadlineAt) {
                    handleTestTimeout();
                }
            }, 250);
        } catch (error) {
            console.warn('KPP: nie udalo sie przywrocic sesji testu', error);
            clearStoredTestSession();
        }
    }

    function clearStoredTestSession() {
        sessionStorage.removeItem(STORAGE_KEY);
    }

    function clearTestTimers() {
        if (state.test.timerId) {
            window.clearInterval(state.test.timerId);
            state.test.timerId = null;
        }
        if (state.test.currentTimeoutId) {
            window.clearTimeout(state.test.currentTimeoutId);
            state.test.currentTimeoutId = null;
        }
    }

    function getWrongCount() {
        return state.test.results.filter((entry) => !entry.isCorrect).length;
    }

    function showEntryScreen(message = '', type = 'info') {
        clearTestTimers();
        if (state.mode === 'test') {
            clearStoredTestSession();
        }
        state.mode = null;
        showScreen('entry');
        updateStatus(message, type);
    }

    function showSessionScreen() {
        showScreen('session');
        updateStatus('');
    }

    function showScreen(name) {
        const entry = document.querySelector(selectors.entry);
        const session = document.querySelector(selectors.session);
        const result = document.querySelector(selectors.result);

        if (entry) {
            entry.hidden = name !== 'entry';
        }
        if (session) {
            session.hidden = name !== 'session';
        }
        if (result) {
            result.hidden = name !== 'result';
        }
    }

    function updateStatus(message, type = 'info') {
        const statusElement = document.querySelector(selectors.status);
        if (!statusElement) {
            return;
        }
        if (!message) {
            statusElement.hidden = true;
            statusElement.textContent = '';
            statusElement.className = 'kpp-status';
            return;
        }
        statusElement.hidden = false;
        statusElement.textContent = message;
        statusElement.className = `kpp-status kpp-status--${type}`;
    }

    function shuffleArray(array) {
        const clone = [...array];
        for (let index = clone.length - 1; index > 0; index -= 1) {
            const nextIndex = Math.floor(Math.random() * (index + 1));
            [clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]];
        }
        return clone;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
