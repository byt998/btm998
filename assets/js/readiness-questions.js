// =========================================================
// File: assets/js/readiness-questions.js
// Readiness inspection questions: test and study modes.
// =========================================================

(() => {
    const TEST_QUESTION_LIMIT = 30;
    const TEST_TIME_LIMIT = 120;
    const ANSWER_KEYS = ['A', 'B', 'C'];

    const DEPARTMENTS = [
        { label: 'Bezpiecze\u0144stwo Po\u017carowe Obiekt\u00f3w i Budynk\u00f3w', table: 'questions_bezpieczenstwo' },
        { label: '\u015arodki ga\u015bnicze neutralizatory i sorbenty', table: 'questions_srodki_gasnicze' },
        { label: 'Wyposa\u017cenie techniczne i sprz\u0119t', table: 'questions_wyposazenie' },
        { label: 'Prawa i obowi\u0105zki operatora pojazdu, sprz\u0119tu po\u017carniczego', table: 'questions_operator' },
        { label: 'Taktyka dzia\u0142a\u0144 ga\u015bniczych', table: 'questions_taktyka_gasnicza' },
        { label: 'Taktyka dzia\u0142a\u0144 ratowniczych \u2013 ratownictwo techniczne i chemiczne', table: 'questions_taktyka_techniczne_chemiczne' },
        { label: 'Taktyka dzia\u0142a\u0144 ratowniczych - dzia\u0142ania poszukiwawczo-ratownicze', table: 'questions_taktyka_poszukiwawcze' },
        { label: 'Taktyka dzia\u0142a\u0144 ratowniczych \u2013 ratownictwo wodne', table: 'questions_taktyka_wodne' },
        { label: 'Taktyka dzia\u0142a\u0144 ratowniczych - dla SGRWN', table: 'questions_taktyka_wodno_nurkowe' },
        { label: 'Taktyka dzia\u0142a\u0144 ratowniczych \u2013 ratownictwo wysoko\u015bciowe', table: 'questions_taktyka_wysokosciowe' },
        { label: '\u0141\u0105czno\u015b\u0107', table: 'questions_lacznosc' },
        { label: 'Praca Stanowisk kierowania', table: 'questions_stanowiska_kierowania' }
    ];

    const selectors = {
        entry: '[data-readiness-entry]',
        departments: '[data-readiness-departments]',
        session: '[data-readiness-session]',
        result: '[data-readiness-result]',
        status: '[data-readiness-status]',
        departmentStatus: '[data-readiness-department-status]',
        modeButtons: '[data-readiness-mode]',
        departmentGrid: '[data-readiness-department-grid]',
        modeTitle: '[data-readiness-mode-title]',
        modeLabel: '[data-readiness-mode-label]',
        departmentLabel: '[data-readiness-department-label]',
        progress: '[data-readiness-progress]',
        timer: '[data-readiness-timer]',
        questionCount: '[data-readiness-question-count]',
        imageWrap: '[data-readiness-image-wrap]',
        questionText: '[data-readiness-question-text]',
        answers: '[data-readiness-answers]',
        studyJump: '[data-readiness-study-jump]',
        jumpInput: '[data-readiness-jump-input]',
        previousButton: '[data-readiness-action="previous-question"]',
        nextButton: '[data-readiness-action="next-question"]',
        actionButtons: '[data-readiness-action]',
        resultStatus: '[data-readiness-result-status]',
        resultTitle: '[data-readiness-result-title]',
        correctCount: '[data-readiness-correct-count]',
        totalCount: '[data-readiness-total-count]'
    };

    const state = {
        supabase: null,
        mode: null,
        department: null,
        questions: [],
        study: {
            index: 0
        },
        test: {
            questions: [],
            index: 0,
            results: [],
            answered: false,
            timerId: null,
            deadlineAt: null
        }
    };

    document.addEventListener('DOMContentLoaded', initReadinessModule);

    function initReadinessModule() {
        state.supabase = window.AppCommon?.supabase || null;
        bindEvents();
        renderDepartmentCards();

        if (!state.supabase) {
            updateStatus(selectors.status, 'Brak konfiguracji Supabase. Modu\u0142 nie mo\u017ce pobra\u0107 pyta\u0144.', 'error');
        }
    }

    function bindEvents() {
        document.querySelectorAll(selectors.modeButtons).forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.getAttribute('data-readiness-mode');
                if (mode === 'test' || mode === 'study') {
                    selectMode(mode);
                }
            });
        });

        document.querySelectorAll(selectors.actionButtons).forEach((button) => {
            button.addEventListener('click', () => handleAction(button.getAttribute('data-readiness-action')));
        });

        document.querySelector(selectors.jumpInput)?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                jumpToStudyQuestion();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeImagePreview();
            }
        });
    }

    function handleAction(action) {
        if (action === 'back-to-entry') {
            showEntryScreen();
            return;
        }
        if (action === 'back-to-departments') {
            showDepartmentScreen();
            return;
        }
        if (action === 'previous-question') {
            goToPreviousStudyQuestion();
            return;
        }
        if (action === 'next-question') {
            goToNextQuestion();
            return;
        }
        if (action === 'jump-to-question') {
            jumpToStudyQuestion();
            return;
        }
        if (action === 'restart-test') {
            restartTest();
        }
    }

    function renderDepartmentCards() {
        const grid = document.querySelector(selectors.departmentGrid);
        if (!grid) {
            return;
        }

        grid.innerHTML = '';
        DEPARTMENTS.forEach((department, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kpp-mode-card readiness-department-card';
            button.dataset.departmentIndex = String(index);

            const title = document.createElement('span');
            title.className = 'kpp-mode-card__title';
            title.textContent = department.label;

            button.appendChild(title);
            button.addEventListener('click', () => selectDepartment(index));
            grid.appendChild(button);
        });
    }

    function selectMode(mode) {
        clearTestTimer();
        state.mode = mode;
        state.department = null;
        state.questions = [];
        updateStatus(selectors.status, '');
        updateStatus(selectors.departmentStatus, '');
        showDepartmentScreen();
    }

    async function selectDepartment(index) {
        const department = DEPARTMENTS[index];
        if (!department || !state.mode) {
            return;
        }
        if (!state.supabase) {
            updateStatus(selectors.departmentStatus, 'Brak konfiguracji Supabase.', 'error');
            return;
        }

        clearTestTimer();
        state.department = department;
        state.questions = [];
        updateStatus(selectors.departmentStatus, '\u0141adowanie pyta\u0144...', 'info');

        try {
            state.questions = await loadQuestions(department.table, state.mode);
        } catch (error) {
            console.error('Readiness questions: fetch failed', error);
            updateStatus(selectors.departmentStatus, 'Nie uda\u0142o si\u0119 pobra\u0107 pyta\u0144 z Supabase.', 'error');
            return;
        }

        if (!state.questions.length) {
            updateStatus(selectors.departmentStatus, 'Brak poprawnych pyta\u0144 w wybranym dziale.', 'error');
            return;
        }

        updateStatus(selectors.departmentStatus, '');
        if (state.mode === 'test') {
            startTestMode();
        } else {
            startStudyMode();
        }
    }

    async function loadQuestions(tableName, mode) {
        let query = state.supabase
            .from(tableName)
            .select('question_text, answer_a, answer_b, answer_c, correct_answer, sort_order, image_url');

        if (mode === 'study') {
            query = query.order('sort_order', { ascending: true });
        }

        const { data, error } = await query;
        if (error) {
            throw error;
        }

        const normalized = (data || [])
            .map((row, index) => normalizeQuestion(row, index))
            .filter(Boolean);

        if (mode === 'study') {
            normalized.sort((left, right) => left.sortOrder - right.sortOrder);
        }

        return normalized;
    }

    function normalizeQuestion(row, index) {
        const questionText = normalizeText(row?.question_text);
        const answerA = normalizeText(row?.answer_a);
        const answerB = normalizeText(row?.answer_b);
        const answerC = normalizeText(row?.answer_c);
        const correctAnswer = normalizeText(row?.correct_answer).toUpperCase();

        if (!questionText || !answerA || !answerB || !answerC || !ANSWER_KEYS.includes(correctAnswer)) {
            console.log('Readiness questions: skipped invalid row', row);
            return null;
        }

        return {
            text: questionText,
            options: {
                A: answerA,
                B: answerB,
                C: answerC
            },
            correctAnswer,
            sortOrder: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : index + 1,
            imageUrl: normalizeText(row?.image_url)
        };
    }

    function startTestMode() {
        clearTestTimer();
        state.test.questions = shuffleArray(state.questions).slice(0, Math.min(TEST_QUESTION_LIMIT, state.questions.length));
        state.test.index = 0;
        state.test.results = [];
        state.test.answered = false;
        showSessionScreen();
        renderTestQuestion();
    }

    function restartTest() {
        if (!state.questions.length) {
            showDepartmentScreen();
            return;
        }
        startTestMode();
    }

    function renderTestQuestion() {
        const question = state.test.questions[state.test.index];
        if (!question) {
            finishTest();
            return;
        }

        state.test.answered = false;
        renderQuestionCommon({
            modeLabel: 'Test',
            questionIndex: state.test.index,
            questionTotal: state.test.questions.length,
            question,
            answerRecord: null,
            showTimer: true,
            answerHandler: handleTestAnswer
        });

        const previousButton = document.querySelector(selectors.previousButton);
        const nextButton = document.querySelector(selectors.nextButton);
        if (previousButton) {
            previousButton.hidden = true;
        }
        if (nextButton) {
            nextButton.hidden = true;
            nextButton.disabled = true;
            nextButton.textContent = state.test.index === state.test.questions.length - 1 ? 'Zako\u0144cz' : 'Nast\u0119pne';
        }
        hideStudyJump();

        startTimer();
    }

    function handleTestAnswer(answerKey) {
        if (state.mode !== 'test' || state.test.answered) {
            return;
        }

        const question = state.test.questions[state.test.index];
        const isCorrect = answerKey === question.correctAnswer;
        state.test.results[state.test.index] = {
            selectedAnswer: answerKey,
            isCorrect,
            isTimeout: false
        };
        state.test.answered = true;
        clearTestTimer();
        highlightAnswers(answerKey, question.correctAnswer);
        showNextButton();
    }

    function handleTestTimeout() {
        if (state.mode !== 'test' || state.test.answered) {
            return;
        }

        const question = state.test.questions[state.test.index];
        state.test.results[state.test.index] = {
            selectedAnswer: null,
            isCorrect: false,
            isTimeout: true
        };
        state.test.answered = true;
        clearTestTimer();
        highlightAnswers(null, question.correctAnswer);
        showNextButton();
    }

    function showNextButton() {
        const nextButton = document.querySelector(selectors.nextButton);
        if (!nextButton) {
            return;
        }
        nextButton.hidden = false;
        nextButton.disabled = false;
    }

    function startTimer() {
        clearTestTimer();
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
        timerElement.textContent = `Pozosta\u0142o: ${secondsLeft} s`;
    }

    function goToNextQuestion() {
        if (state.mode === 'test') {
            if (!state.test.answered) {
                return;
            }
            if (state.test.index >= state.test.questions.length - 1) {
                finishTest();
                return;
            }
            state.test.index += 1;
            renderTestQuestion();
            return;
        }

        if (state.mode === 'study' && state.study.index < state.questions.length - 1) {
            state.study.index += 1;
            renderStudyQuestion();
        }
    }

    function startStudyMode() {
        clearTestTimer();
        state.study.index = 0;
        showSessionScreen();
        renderStudyQuestion();
    }

    function renderStudyQuestion() {
        const question = state.questions[state.study.index];
        if (!question) {
            showDepartmentScreen();
            return;
        }

        renderQuestionCommon({
            modeLabel: 'Nauka',
            questionIndex: state.study.index,
            questionTotal: state.questions.length,
            question,
            answerRecord: {
                selectedAnswer: question.correctAnswer
            },
            showTimer: false,
            answerHandler: null
        });

        const previousButton = document.querySelector(selectors.previousButton);
        const nextButton = document.querySelector(selectors.nextButton);
        if (previousButton) {
            previousButton.hidden = false;
            previousButton.disabled = state.study.index === 0;
        }
        if (nextButton) {
            nextButton.hidden = false;
            nextButton.disabled = state.study.index >= state.questions.length - 1;
            nextButton.textContent = 'Nast\u0119pne';
        }
        updateStudyJump();
    }

    function goToPreviousStudyQuestion() {
        if (state.mode !== 'study' || state.study.index === 0) {
            return;
        }
        state.study.index -= 1;
        renderStudyQuestion();
    }

    function jumpToStudyQuestion() {
        if (state.mode !== 'study' || !state.questions.length) {
            return;
        }

        const input = document.querySelector(selectors.jumpInput);
        if (!input) {
            return;
        }

        const requestedNumber = Number.parseInt(input.value, 10);
        if (!Number.isInteger(requestedNumber)) {
            updateStudyJump();
            input.focus();
            input.select();
            return;
        }

        const safeNumber = Math.min(Math.max(requestedNumber, 1), state.questions.length);
        state.study.index = safeNumber - 1;
        renderStudyQuestion();
    }

    function updateStudyJump() {
        const wrapper = document.querySelector(selectors.studyJump);
        const input = document.querySelector(selectors.jumpInput);
        if (!wrapper || !input) {
            return;
        }

        wrapper.hidden = state.mode !== 'study';
        input.min = '1';
        input.max = String(state.questions.length);
        input.value = String(state.study.index + 1);
        input.setAttribute('aria-label', `Numer pytania od 1 do ${state.questions.length}`);
    }

    function hideStudyJump() {
        const wrapper = document.querySelector(selectors.studyJump);
        if (wrapper) {
            wrapper.hidden = true;
        }
    }

    function renderQuestionCommon({
        modeLabel,
        questionIndex,
        questionTotal,
        question,
        answerRecord,
        showTimer,
        answerHandler
    }) {
        setText(selectors.modeLabel, modeLabel);
        setText(selectors.departmentLabel, state.department?.label || 'Dzia\u0142');
        setText(selectors.progress, `${questionIndex + 1} / ${questionTotal}`);
        setText(selectors.questionCount, `Pytanie ${questionIndex + 1}`);
        setText(selectors.questionText, question.text);

        const timerElement = document.querySelector(selectors.timer);
        if (timerElement) {
            timerElement.hidden = !showTimer;
            if (showTimer) {
                timerElement.textContent = `Pozosta\u0142o: ${TEST_TIME_LIMIT} s`;
            }
        }

        renderQuestionImage(question);
        renderAnswers(question, answerRecord, answerHandler);
    }

    function renderQuestionImage(question) {
        const imageWrap = document.querySelector(selectors.imageWrap);
        if (!imageWrap) {
            return;
        }

        imageWrap.innerHTML = '';
        imageWrap.hidden = true;

        if (!question.imageUrl) {
            return;
        }

        const image = document.createElement('img');
        image.className = 'question-image';
        image.src = question.imageUrl;
        image.alt = question.text;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.onerror = () => {
            imageWrap.innerHTML = '';
            imageWrap.hidden = true;
        };

        image.addEventListener('click', () => openImagePreview(question.imageUrl, question.text));

        imageWrap.appendChild(image);
        imageWrap.hidden = false;
    }

    function openImagePreview(imageUrl, altText) {
        if (!imageUrl) {
            return;
        }

        const modal = getImagePreviewModal();
        const image = modal.querySelector('[data-readiness-preview-image]');
        if (!image) {
            return;
        }

        image.src = imageUrl;
        image.alt = altText || 'Podgl\u0105d zdj\u0119cia';
        modal.hidden = false;
        document.body.classList.add('is-readiness-preview-open');
    }

    function closeImagePreview() {
        const modal = document.querySelector('[data-readiness-image-preview]');
        const image = modal?.querySelector('[data-readiness-preview-image]');
        if (!modal) {
            return;
        }

        modal.hidden = true;
        if (image) {
            image.removeAttribute('src');
            image.alt = '';
        }
        document.body.classList.remove('is-readiness-preview-open');
    }

    function getImagePreviewModal() {
        const existingModal = document.querySelector('[data-readiness-image-preview]');
        if (existingModal) {
            return existingModal;
        }

        const modal = document.createElement('div');
        modal.className = 'question-image-modal';
        modal.dataset.readinessImagePreview = '';
        modal.hidden = true;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'question-image-modal__close';
        closeButton.setAttribute('aria-label', 'Zamknij podgl\u0105d zdj\u0119cia');
        closeButton.textContent = '\u00d7';

        const image = document.createElement('img');
        image.className = 'question-image-modal__image';
        image.dataset.readinessPreviewImage = '';
        image.alt = '';

        closeButton.addEventListener('click', closeImagePreview);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeImagePreview();
            }
        });

        modal.append(closeButton, image);
        document.body.appendChild(modal);
        return modal;
    }

    function renderAnswers(question, answerRecord, answerHandler) {
        const answersElement = document.querySelector(selectors.answers);
        if (!answersElement) {
            return;
        }

        answersElement.innerHTML = '';
        ANSWER_KEYS.forEach((answerKey) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'kpp-answer';
            button.dataset.answer = answerKey;

            const key = document.createElement('span');
            key.className = 'kpp-answer__key';
            key.textContent = answerKey;

            const text = document.createElement('span');
            text.textContent = question.options[answerKey];

            button.append(key, text);

            if (answerRecord) {
                button.disabled = true;
                applyAnswerClasses(button, answerKey, answerRecord.selectedAnswer, question.correctAnswer);
            } else {
                button.addEventListener('click', () => answerHandler?.(answerKey));
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
        clearTestTimer();
        const total = state.test.questions.length;
        const correct = state.test.results.filter((result) => result?.isCorrect).length;

        setText(selectors.resultStatus, 'Wynik testu');
        setText(selectors.resultTitle, `Wynik: ${correct} / ${total}`);
        setText(selectors.correctCount, String(correct));
        setText(selectors.totalCount, String(total));
        showScreen('result');
    }

    function showEntryScreen() {
        clearTestTimer();
        state.mode = null;
        state.department = null;
        state.questions = [];
        updateStatus(selectors.departmentStatus, '');
        showScreen('entry');
    }

    function showDepartmentScreen() {
        clearTestTimer();
        const title = state.mode === 'test' ? 'Test - wybierz dzia\u0142' : 'Nauka - wybierz dzia\u0142';
        setText(selectors.modeTitle, title);
        showScreen('departments');
    }

    function showSessionScreen() {
        updateStatus(selectors.departmentStatus, '');
        showScreen('session');
    }

    function showScreen(screenName) {
        const screens = {
            entry: document.querySelector(selectors.entry),
            departments: document.querySelector(selectors.departments),
            session: document.querySelector(selectors.session),
            result: document.querySelector(selectors.result)
        };

        Object.entries(screens).forEach(([name, element]) => {
            if (element) {
                element.hidden = name !== screenName;
            }
        });
    }

    function updateStatus(selector, message, type = 'info') {
        const element = document.querySelector(selector);
        if (!element) {
            return;
        }

        element.textContent = message || '';
        element.hidden = !message;
        element.classList.toggle('kpp-status--error', type === 'error');
        element.classList.toggle('kpp-status--success', type === 'success');
    }

    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    }

    function clearTestTimer() {
        if (state.test.timerId) {
            window.clearInterval(state.test.timerId);
            state.test.timerId = null;
        }
        state.test.deadlineAt = null;
    }

    function shuffleArray(items) {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
        }
        return copy;
    }

    function normalizeText(value) {
        return String(value ?? '').trim();
    }
})();
