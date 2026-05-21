(() => {
    const VEHICLE_GROUPS = [
        {
            code: 'GBA',
            label: 'GBA',
            slots: [
                { code: 'dowodca', label: 'Dowódca', requiredRole: 'dowodca' },
                { code: 'kierowca', label: 'Kierowca', requiredRole: 'kierowca' },
                { code: 'ratownik-1', label: 'Ratownik 1', requiredRole: 'ratownik' },
                { code: 'ratownik-2', label: 'Ratownik 2', requiredRole: 'ratownik' },
                { code: 'ratownik-3', label: 'Ratownik 3', requiredRole: 'ratownik' },
                { code: 'ratownik-4', label: 'Ratownik 4', requiredRole: 'ratownik' },
            ],
        },
        {
            code: 'GCBA',
            label: 'GCBA',
            slots: [
                { code: 'dowodca', label: 'Dowódca', requiredRole: 'dowodca' },
                { code: 'kierowca', label: 'Kierowca', requiredRole: 'kierowca' },
                { code: 'ratownik-1', label: 'Ratownik 1', requiredRole: 'ratownik' },
                { code: 'ratownik-2', label: 'Ratownik 2', requiredRole: 'ratownik' },
                { code: 'ratownik-3', label: 'Ratownik 3', requiredRole: 'ratownik' },
                { code: 'ratownik-4', label: 'Ratownik 4', requiredRole: 'ratownik' },
            ],
        },
        {
            code: 'SCD-37',
            label: 'SCD-37',
            slots: [
                { code: 'dowodca', label: 'Dowódca', requiredRole: 'dowodca' },
                { code: 'kierowca', label: 'Kierowca', requiredRole: 'kierowca' },
                { code: 'ratownik-1', label: 'Ratownik', requiredRole: 'ratownik' },
            ],
        },
        {
            code: 'RT',
            label: 'RT',
            slots: [
                { code: 'dowodca', label: 'Dowódca', requiredRole: 'dowodca' },
                { code: 'kierowca', label: 'Kierowca', requiredRole: 'kierowca' },
                { code: 'ratownik-1', label: 'Ratownik', requiredRole: 'ratownik' },
            ],
        },
        {
            code: 'SGRWN+SGS',
            label: 'SGRWN+SGS',
            slots: [
                { code: 'sgrwn-1', label: '1', requiredRole: 'nurek' },
                { code: 'sgrwn-2', label: '2', requiredRole: 'nurek' },
                { code: 'sgrwn-3', label: '3', requiredRole: 'nurek' },
                { code: 'sgrwn-4', label: '4', requiredRole: 'nurek' },
                { code: 'sgrwn-5', label: '5', requiredRole: 'nurek' },
                { code: 'sgrwn-6', label: '6', requiredRole: 'nurek' },
                { code: 'sonarzysta', label: 'Sonarzysta', requiredRole: 'nurek', section: 'SGS' },
                { code: 'stermotorzysta', label: 'Stermotorzysta', requiredRole: 'nurek', section: 'SGS' },
                { code: 'kierowca-sgs', label: 'Kierowca', requiredRole: 'kierowca', section: 'SGS' },
            ],
        },
    ];

    const selectors = {
        status: '[data-command-order-status]',
        date: '[data-command-order-date]',
        cards: '[data-command-order-cards]',
        modal: '[data-command-order-modal]',
        modalBody: '[data-command-order-modal-body]',
        refillButton: '[data-command-order-action="refill-crews"]',
        runSgrwnButtons: '[data-command-order-action="run-sgrwn"]',
    };

    const state = {
        supabase: null,
        user: null,
        profile: null,
        canEdit: false,
        selectedDate: '',
        selectedShift: 'zmiana-1',
        visibleUsers: [],
        crewsByKey: new Map(),
        expandedVehicles: new Set(['GBA']),
        editingSlotId: '',
        loading: false,
        shareBusy: false,
        modalCrewsByKey: new Map(),
        modalEditingSlotId: '',
        modalVacatedSlotIds: new Set(),
        modalBlockedUserIds: new Set(),
        modalBlockedManualNames: new Set(),
        modalDepartureApplied: false,
    };

    document.addEventListener('DOMContentLoaded', initModule);

    async function initModule() {
        if (document.body.dataset.page !== 'panel-dowodcy') {
            return;
        }

        state.supabase = window.AppCommon?.supabase || null;
        if (!state.supabase) {
            return;
        }

        const { data } = await state.supabase.auth.getSession();
        state.user = data.session?.user || null;
        if (!state.user) {
            return;
        }

        state.profile = window.AppCommon?.getCachedProfile?.() || null;
        if (!state.profile || state.profile.userId !== state.user.id) {
            state.profile = await window.AppCommon?.refreshProfile?.(state.user);
        }
        if (!state.profile) {
            return;
        }

        state.canEdit = Boolean(state.profile.dowodca || state.profile.canManageCommandOrder);
        state.selectedDate = getTodayIsoDate();
        state.selectedShift = normalizeShiftCode(state.profile.shiftCode);

        bindEvents();
        renderMeta();
        renderCards();
        await loadOrderData();
    }

    function bindEvents() {
        window.addEventListener('hashchange', () => {
            if (resolveCurrentView() !== 'order') {
                state.editingSlotId = '';
                closeModal();
                return;
            }
            renderMeta();
            renderCards();
            loadOrderData();
        });

        document.querySelector(selectors.cards)?.addEventListener('click', handleCardsClick);
        document.querySelector(selectors.cards)?.addEventListener('keydown', handleCardsKeydown);
        document.querySelector(selectors.modal)?.addEventListener('click', handleModalClick);
        document.addEventListener('click', handleGlobalClick);
    }

    function resolveCurrentView() {
        const hash = window.location.hash.replace('#', '').trim();
        if (hash === 'order' || hash === 'status') {
            return hash;
        }
        return 'home';
    }

    function normalizeShiftCode(value) {
        if (value === 'zmiana-1' || value === 'zmiana-2' || value === 'zmiana-3') {
            return value;
        }
        return 'zmiana-1';
    }

    function getTodayIsoDate() {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const local = new Date(now.getTime() - offset * 60000);
        return local.toISOString().slice(0, 10);
    }

    async function loadOrderData() {
        if (resolveCurrentView() !== 'order' || state.loading) {
            return;
        }

        state.loading = true;
        setStatus('Ładowanie obsad...', false);

        try {
            await Promise.all([loadVisibleUsers(), loadCrewAssignments()]);

            if (state.canEdit) {
                setStatus('', false);
            } else {
                setStatus('Obsady może edytować tylko dowódca lub użytkownik z uprawnieniem zarządzania rozkazem.', false);
            }
        } catch (error) {
            console.error(error);
            setStatus(resolveLoadErrorMessage(error), true);
        } finally {
            state.loading = false;
            renderCards();
            if (!document.querySelector(selectors.modal)?.hidden) {
                resetModalState();
                renderModal();
            }
        }
    }

    async function loadVisibleUsers() {
        let data = null;
        let error = null;

        ({ data, error } = await state.supabase
            .from('registered_users')
            .select('user_id, phone, shift_code, ratownik, dowodca, kierowca, nurek, can_manage_command_order, authorized_users ( first_name, last_name )')
            .eq('shift_code', state.selectedShift)
            .order('phone', { ascending: true }));

        if (error) {
            console.warn('registered_users + authorized_users fallback:', error);
            ({ data, error } = await state.supabase
                .from('registered_users')
                .select('user_id, phone, shift_code, ratownik, dowodca, kierowca, nurek, can_manage_command_order')
                .eq('shift_code', state.selectedShift)
                .order('phone', { ascending: true }));
        }

        if (error) {
            throw error;
        }

        state.visibleUsers = (data || [])
            .map((row) => ({
                userId: row.user_id,
                phone: row.phone || '',
                shiftCode: row.shift_code || '',
                firstName: row.authorized_users?.first_name || '',
                lastName: row.authorized_users?.last_name || '',
                ratownik: Boolean(row.ratownik),
                dowodca: Boolean(row.dowodca),
                kierowca: Boolean(row.kierowca),
                nurek: Boolean(row.nurek),
                canManageCommandOrder: Boolean(row.can_manage_command_order),
            }))
            .filter((user) => user.dowodca || user.kierowca || user.ratownik || user.nurek)
            .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b), 'pl'));
    }

    async function loadCrewAssignments() {
        const { data, error } = await state.supabase
            .from('vehicle_crews')
            .select('id, crew_date, shift_code, vehicle_code, slot_code, slot_label, required_role, assigned_user_id, assigned_manual_name, updated_by, updated_at')
            .eq('crew_date', state.selectedDate)
            .eq('shift_code', state.selectedShift);

        if (error) {
            if (String(error.message || '').toLowerCase().includes('vehicle_crews')) {
                state.crewsByKey = new Map();
                setStatus('Brak tabeli vehicle_crews. Uruchom migrację SQL.', true);
                return;
            }
            throw error;
        }

        state.crewsByKey = new Map((data || []).map((row) => [getCrewKey(row.vehicle_code, row.slot_code), row]));
    }

    function renderMeta() {
        const dateElement = document.querySelector(selectors.date);
        if (dateElement) {
            dateElement.textContent = formatDisplayDate(state.selectedDate);
        }
    }

    function renderCards() {
        const container = document.querySelector(selectors.cards);
        if (!container) {
            return;
        }

        container.innerHTML = VEHICLE_GROUPS.map((group) => {
            const isExpanded = state.expandedVehicles.has(group.code);
            return `
                <article class="commander-order__vehicle-card">
                    <header class="commander-order__vehicle-header">
                        <div>
                            <p class="commander-order__eyebrow">Obsada</p>
                            <h3 class="commander-order__vehicle-title">${escapeHtml(group.label)}</h3>
                        </div>
                        <button type="button" class="commander-order__toggle" data-command-order-action="toggle-vehicle" data-vehicle-code="${escapeHtml(group.code)}">
                            ${isExpanded ? 'Zwiń' : 'Rozwiń'}
                        </button>
                    </header>
                    <div class="commander-order__slots" ${isExpanded ? '' : 'hidden'}>
                        ${renderGroupSlots(group)}
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderGroupSlots(group) {
        let currentSection = '';

        return group.slots.map((slot) => {
            const record = getCrewRecord(group.code, slot.code);
            const pieces = [];

            if (slot.section && slot.section !== currentSection) {
                currentSection = slot.section;
                pieces.push(`<div class="commander-order__slots-section-title">${escapeHtml(slot.section)}</div>`);
            }

            pieces.push(renderMainSlot(group, slot, record));
            return pieces.join('');
        }).join('');
    }

    function renderMainSlot(group, slot, record) {
        const slotId = getSlotId(group.code, slot.code);
        const assignedName = getAssignedName(record);
        const isEditing = state.editingSlotId === slotId;

        if (!state.canEdit || !isEditing) {
            const actionButton = state.canEdit
                ? assignedName
                    ? '<button type="button" class="btn btn--ghost commander-order__slot-action-btn" data-command-order-action="edit-slot">Edytuj</button>'
                    : '<button type="button" class="btn btn--primary commander-order__slot-action-btn" data-command-order-action="edit-slot">+ Dodaj</button>'
                : '';

            return `
                <article class="commander-order__slot" data-slot-id="${escapeHtml(slotId)}">
                    <div class="commander-order__slot-display">
                        <span class="commander-order__slot-label">${escapeHtml(slot.label)}:</span>
                        <span class="commander-order__slot-value">
                            ${assignedName
                                ? `<span class="commander-order__person-chip"><span>${escapeHtml(assignedName)}</span></span>`
                                : '<span class="commander-order__person-placeholder">Brak przypisania</span>'}
                        </span>
                        ${actionButton}
                    </div>
                </article>
            `;
        }

        return `
            <article class="commander-order__slot commander-order__slot--editing" data-slot-id="${escapeHtml(slotId)}">
                <div class="commander-order__slot-head">
                    <span class="commander-order__slot-label">${escapeHtml(slot.label)}:</span>
                </div>
                <div class="commander-order__current">
                    ${assignedName
                        ? `<span class="commander-order__person-chip"><span>${escapeHtml(assignedName)}</span></span>`
                        : '<span class="commander-order__person-placeholder">Brak przypisanej osoby</span>'}
                </div>
                <div class="commander-order__slot-editor">
                    <select class="form-field__input" data-slot-select>
                        ${buildMainCandidateOptions(slot.requiredRole, record?.assigned_user_id || '')}
                    </select>
                    <input
                        type="text"
                        class="form-field__input"
                        data-slot-manual
                        value="${escapeHtml(record?.assigned_manual_name || '')}"
                        placeholder="Wpisz ręcznie imię i nazwisko"
                    />
                </div>
                <div class="commander-order__slot-editor-actions">
                    <button type="button" class="btn btn--primary" data-command-order-action="save-slot">Zapisz</button>
                    <button type="button" class="btn btn--ghost" data-command-order-action="cancel-slot">Anuluj</button>
                    ${assignedName ? '<button type="button" class="btn btn--ghost" data-command-order-action="clear-slot">Wyczyść</button>' : ''}
                </div>
            </article>
        `;
    }

    function buildMainCandidateOptions(requiredRole, selectedUserId) {
        return ['<option value="">Wybierz z listy</option>']
            .concat(
                getCandidatesForRole(requiredRole).map((user) => {
                    const selected = user.userId === selectedUserId ? 'selected' : '';
                    return `<option value="${escapeHtml(user.userId)}" ${selected}>${escapeHtml(getUserDisplayName(user))}</option>`;
                })
            )
            .join('');
    }

    function getCandidatesForRole(requiredRole) {
        return state.visibleUsers.filter((user) => user.shiftCode === state.selectedShift && matchesRole(user, requiredRole));
    }

    function matchesRole(user, role) {
        if (role === 'dowodca') return Boolean(user.dowodca);
        if (role === 'kierowca') return Boolean(user.kierowca);
        if (role === 'ratownik') return Boolean(user.ratownik);
        if (role === 'nurek') return Boolean(user.nurek);
        return false;
    }

    async function handleCardsClick(event) {
        const button = event.target.closest('[data-command-order-action]');
        if (!button) {
            return;
        }

        const action = button.dataset.commandOrderAction;
        const slotElement = button.closest('[data-slot-id]');
        const slotId = slotElement?.dataset.slotId || '';

        if (action === 'toggle-vehicle') {
            const vehicleCode = button.dataset.vehicleCode || '';
            if (state.expandedVehicles.has(vehicleCode)) {
                state.expandedVehicles.delete(vehicleCode);
            } else {
                state.expandedVehicles.add(vehicleCode);
            }
            renderCards();
            return;
        }

        if (action === 'edit-slot') {
            state.editingSlotId = slotId;
            renderCards();
            return;
        }

        if (action === 'cancel-slot') {
            state.editingSlotId = '';
            renderCards();
            return;
        }

        if (action === 'save-slot') {
            const userId = slotElement?.querySelector('[data-slot-select]')?.value || '';
            const manualName = slotElement?.querySelector('[data-slot-manual]')?.value.trim() || '';

            if (!userId && !manualName) {
                setStatus('Wybierz osobę z listy albo wpisz ją ręcznie.', true);
                return;
            }

            state.editingSlotId = '';
            await saveMainSlotAssignment(slotId, userId, manualName);
            return;
        }

        if (action === 'clear-slot') {
            state.editingSlotId = '';
            await clearMainSlotAssignment(slotId);
        }
    }

    function handleCardsKeydown(event) {
        const trigger = event.target.closest('[data-command-order-action="edit-slot"]');
        if (!trigger) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            trigger.click();
        }
    }

    async function handleGlobalClick(event) {
        const button = event.target.closest('[data-command-order-action]');
        if (!button) {
            return;
        }

        const action = button.dataset.commandOrderAction;
        if (action === 'show-all') {
            openModal();
            return;
        }
        if (action === 'share-image') {
            await shareOrderImage();
            return;
        }
        if (action === 'share-modal-image') {
            await shareModalImage();
            return;
        }
        if (action === 'run-sgrwn') {
            await runSgrwnDeparture();
            return;
        }
        if (action === 'refill-crews') {
            await refillCrewsAfterSgrwn();
        }
    }

    async function handleModalClick(event) {
        const modal = document.querySelector(selectors.modal);
        if (event.target === modal) {
            closeModal();
            return;
        }

        const button = event.target.closest('[data-command-order-action]');
        if (!button) {
            return;
        }

        const action = button.dataset.commandOrderAction;
        const slotElement = button.closest('[data-modal-slot-id]');
        const slotId = slotElement?.dataset.modalSlotId || '';

        if (action === 'close-modal') {
            closeModal();
            return;
        }

        if (action === 'modal-edit-slot') {
            state.modalEditingSlotId = slotId;
            renderModal();
            return;
        }

        if (action === 'modal-cancel-slot') {
            state.modalEditingSlotId = '';
            renderModal();
            return;
        }

        if (action === 'modal-pick-user') {
            const userId = button.dataset.userId || '';
            assignModalSlot(slotId, userId, '');
            return;
        }

        if (action === 'modal-save-manual') {
            const manualName = slotElement?.querySelector('[data-modal-manual]')?.value.trim() || '';
            if (!manualName) {
                setStatus('Wpisz ręcznie imię i nazwisko.', true);
                return;
            }
            if (state.modalBlockedManualNames.has(normalizeManualName(manualName))) {
                setStatus('Ta osoba jest obecnie w SGRWN+SGS i nie może być wpisana w tym oknie.', true);
                return;
            }
            assignModalSlot(slotId, '', manualName);
            return;
        }

        if (action === 'modal-clear-slot') {
            clearModalSlot(slotId);
        }
    }

    async function saveMainSlotAssignment(slotId, userId, manualName) {
        if (!state.canEdit || !slotId) {
            return;
        }

        const slotInfo = findSlotById(slotId);
        if (!slotInfo) {
            return;
        }

        try {
            const data = await upsertCrewAssignment(slotInfo, userId, manualName);
            state.crewsByKey.set(getCrewKey(data.vehicle_code, data.slot_code), data);
            setStatus('', false);
            renderCards();
        } catch (error) {
            console.error(error);
            setStatus('Nie udało się zapisać obsady.', true);
        }
    }

    async function clearMainSlotAssignment(slotId) {
        if (!state.canEdit || !slotId) {
            return;
        }

        const slotInfo = findSlotById(slotId);
        if (!slotInfo) {
            return;
        }

        const { error } = await state.supabase
            .from('vehicle_crews')
            .delete()
            .eq('crew_date', state.selectedDate)
            .eq('shift_code', state.selectedShift)
            .eq('vehicle_code', slotInfo.group.code)
            .eq('slot_code', slotInfo.slot.code);

        if (error) {
            console.error(error);
            setStatus('Nie udało się usunąć obsady.', true);
            return;
        }

        state.crewsByKey.delete(getCrewKey(slotInfo.group.code, slotInfo.slot.code));
        setStatus('', false);
        renderCards();
    }

    function openModal() {
        const modal = document.querySelector(selectors.modal);
        if (!modal) {
            return;
        }

        resetModalState();
        modal.hidden = false;
        renderModal();
    }

    function closeModal() {
        const modal = document.querySelector(selectors.modal);
        if (!modal) {
            return;
        }

        modal.hidden = true;
        resetModalState();
    }

    function resetModalState() {
        state.modalCrewsByKey = cloneCrewMap(state.crewsByKey);
        state.modalEditingSlotId = '';
        state.modalVacatedSlotIds = new Set();
        state.modalBlockedUserIds = new Set();
        state.modalBlockedManualNames = new Set();
        state.modalDepartureApplied = false;
    }

    function renderModal() {
        const modal = document.querySelector(selectors.modal);
        const body = document.querySelector(selectors.modalBody);
        const refillButton = document.querySelector(selectors.refillButton);
        const runSgrwnButtons = document.querySelectorAll(selectors.runSgrwnButtons);

        if (!modal || !body || modal.hidden) {
            return;
        }

        runSgrwnButtons.forEach((button) => {
            button.hidden = !state.canEdit;
        });
        if (refillButton) {
            refillButton.hidden = !state.canEdit || !state.modalDepartureApplied;
        }

        body.innerHTML = VEHICLE_GROUPS.map((group) => `
            <section class="commander-order__modal-group">
                <h3>${escapeHtml(group.label)}</h3>
                <div class="commander-order__modal-list">
                    ${renderModalGroupSlots(group)}
                </div>
            </section>
        `).join('');
    }

    function renderModalGroupSlots(group) {
        let currentSection = '';

        return group.slots.map((slot) => {
            const pieces = [];
            if (slot.section && slot.section !== currentSection) {
                currentSection = slot.section;
                pieces.push(`<div class="commander-order__slots-section-title">${escapeHtml(slot.section)}</div>`);
            }
            pieces.push(renderModalSlot(group, slot));
            return pieces.join('');
        }).join('');
    }

    function renderModalSlot(group, slot) {
        const slotId = getSlotId(group.code, slot.code);
        const record = getModalCrewRecord(group.code, slot.code);
        const assignedName = getAssignedName(record);
        const isEditing = state.canEdit && state.modalEditingSlotId === slotId;
        const isVacated = state.modalVacatedSlotIds.has(slotId) && !assignedName;
        const slotClassName = [
            'commander-order__modal-slot',
            isEditing ? 'commander-order__modal-slot--editing' : '',
            isVacated ? 'commander-order__modal-slot--vacated' : '',
        ].filter(Boolean).join(' ');

        if (!isEditing) {
            const actionButton = state.canEdit
                ? assignedName
                    ? '<button type="button" class="btn btn--ghost commander-order__slot-action-btn" data-command-order-action="modal-edit-slot">Edytuj</button>'
                    : '<button type="button" class="btn btn--primary commander-order__slot-action-btn" data-command-order-action="modal-edit-slot">+ Dodaj</button>'
                : '';

            return `
                <article class="${escapeHtml(slotClassName)}" data-modal-slot-id="${escapeHtml(slotId)}">
                    <div class="commander-order__slot-display">
                        <span class="commander-order__slot-label">${escapeHtml(slot.label)}:</span>
                        <span class="commander-order__slot-value">
                            ${assignedName
                                ? `<span class="commander-order__person-chip"><span>${escapeHtml(assignedName)}</span></span>`
                                : `<span class="${isVacated ? 'commander-order__person-placeholder commander-order__person-placeholder--vacated' : 'commander-order__person-placeholder'}">Brak przypisania</span>`}
                        </span>
                        ${actionButton}
                    </div>
                </article>
            `;
        }

        return `
            <article class="${escapeHtml(slotClassName)}" data-modal-slot-id="${escapeHtml(slotId)}">
                <div class="commander-order__slot-head">
                    <span class="commander-order__slot-label">${escapeHtml(slot.label)}:</span>
                </div>
                <div class="commander-order__current">
                    ${assignedName
                        ? `<span class="commander-order__person-chip"><span>${escapeHtml(assignedName)}</span></span>`
                        : '<span class="commander-order__person-placeholder">Brak przypisanej osoby</span>'}
                </div>
                <div class="commander-order__candidate-list">
                    ${buildModalCandidateButtons(slot.requiredRole, slotId)}
                </div>
                ${buildBlockedPersonsInfo(slot.requiredRole)}
                <div class="commander-order__slot-editor">
                    <input
                        type="text"
                        class="form-field__input"
                        data-modal-manual
                        value="${escapeHtml(record?.assigned_manual_name || '')}"
                        placeholder="Wpisz ręcznie imię i nazwisko"
                    />
                </div>
                <div class="commander-order__slot-editor-actions">
                    <button type="button" class="btn btn--primary" data-command-order-action="modal-save-manual">Zapisz ręcznie</button>
                    <button type="button" class="btn btn--ghost" data-command-order-action="modal-cancel-slot">Anuluj</button>
                    ${assignedName ? '<button type="button" class="btn btn--ghost" data-command-order-action="modal-clear-slot">Wyczyść</button>' : ''}
                </div>
            </article>
        `;
    }

    function buildModalCandidateButtons(requiredRole, currentSlotId) {
        const candidates = getCandidatesForRole(requiredRole);
        if (!candidates.length) {
            return '<p class="commander-order__candidate-empty">Brak dostępnych osób dla tej funkcji.</p>';
        }

        return candidates.map((user) => {
            const isAssignedElsewhere = isUserAssignedElsewhereInModal(user.userId, currentSlotId);
            const isBlocked = state.modalBlockedUserIds.has(user.userId);
            const className = [
                'commander-order__candidate-btn',
                isAssignedElsewhere ? 'commander-order__candidate-btn--assigned' : '',
                isBlocked ? 'commander-order__candidate-btn--blocked' : '',
            ].filter(Boolean).join(' ');
            const disabled = isBlocked ? 'disabled' : '';
            const note = isBlocked
                ? '<span class="commander-order__candidate-note">SGRWN+SGS</span>'
                : isAssignedElsewhere
                    ? '<span class="commander-order__candidate-note">Już przypisany</span>'
                    : '';

            return `
                <button type="button" class="${className}" data-command-order-action="modal-pick-user" data-user-id="${escapeHtml(user.userId)}" ${disabled}>
                    <span>${escapeHtml(getUserDisplayName(user))}</span>
                    ${note}
                </button>
            `;
        }).join('');
    }

    function buildBlockedPersonsInfo(requiredRole) {
        if (!state.modalDepartureApplied) {
            return '';
        }

        const blockedUsers = getCandidatesForRole(requiredRole)
            .filter((user) => state.modalBlockedUserIds.has(user.userId))
            .map((user) => getUserDisplayName(user));

        const blockedManualNames = Array.from(state.modalBlockedManualNames);
        const items = blockedUsers.concat(blockedManualNames);

        if (!items.length) {
            return '';
        }

        return `
            <div class="commander-order__blocked-info">
                <p class="commander-order__blocked-title">Niedostępne po wyjeździe SGRWN</p>
                <div class="commander-order__blocked-list">
                    ${items.map((item) => `<span class="commander-order__blocked-chip">${escapeHtml(item)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    function assignModalSlot(slotId, userId, manualName, options = {}) {
        const slotInfo = findSlotById(slotId);
        if (!slotInfo) {
            return;
        }

        const payload = {
            id: getSyntheticModalId(slotInfo.group.code, slotInfo.slot.code),
            crew_date: state.selectedDate,
            shift_code: state.selectedShift,
            vehicle_code: slotInfo.group.code,
            slot_code: slotInfo.slot.code,
            slot_label: slotInfo.slot.label,
            required_role: slotInfo.slot.requiredRole,
            assigned_user_id: userId || null,
            assigned_manual_name: userId ? null : (manualName || null),
            updated_by: state.user.id,
            updated_at: new Date().toISOString(),
        };

        state.modalCrewsByKey.set(getCrewKey(slotInfo.group.code, slotInfo.slot.code), payload);
        state.modalVacatedSlotIds.delete(slotId);
        state.modalEditingSlotId = '';
        setStatus('', false);
        if (!options.skipRender) {
            renderModal();
        }
    }

    function clearModalSlot(slotId) {
        const slotInfo = findSlotById(slotId);
        if (!slotInfo) {
            return;
        }

        state.modalCrewsByKey.delete(getCrewKey(slotInfo.group.code, slotInfo.slot.code));
        state.modalEditingSlotId = '';
        renderModal();
    }

    async function runSgrwnDeparture() {
        if (!state.canEdit) {
            return;
        }

        const sgrwnRows = Array.from(state.modalCrewsByKey.values()).filter((row) =>
            row.vehicle_code === 'SGRWN+SGS' && (row.assigned_user_id || normalizeManualName(row.assigned_manual_name))
        );

        if (!sgrwnRows.length) {
            setStatus('Brak obsady SGRWN+SGS do odjęcia od pozostałych wozów.', true);
            return;
        }

        state.modalBlockedUserIds = new Set(
            sgrwnRows.map((row) => row.assigned_user_id).filter(Boolean)
        );
        state.modalBlockedManualNames = new Set(
            sgrwnRows.map((row) => normalizeManualName(row.assigned_manual_name)).filter(Boolean)
        );

        Array.from(state.modalCrewsByKey.values()).forEach((row) => {
            if (row.vehicle_code === 'SGRWN+SGS') {
                return;
            }

            const matchesBlockedUser = row.assigned_user_id && state.modalBlockedUserIds.has(row.assigned_user_id);
            const matchesBlockedManual = normalizeManualName(row.assigned_manual_name) && state.modalBlockedManualNames.has(normalizeManualName(row.assigned_manual_name));

            if (!matchesBlockedUser && !matchesBlockedManual) {
                return;
            }

            const slotId = getSlotId(row.vehicle_code, row.slot_code);
            state.modalCrewsByKey.delete(getCrewKey(row.vehicle_code, row.slot_code));
            state.modalVacatedSlotIds.add(slotId);
        });

        state.modalDepartureApplied = true;
        state.modalEditingSlotId = '';
        setStatus('Usunięto osoby z SGRWN+SGS z pozostałych obsad w oknie operacyjnym.', false);
        renderModal();
    }

    async function refillCrewsAfterSgrwn() {
        if (!state.canEdit || !state.modalDepartureApplied) {
            return;
        }

        const slotsToFill = [];
        for (const group of VEHICLE_GROUPS) {
            for (const slot of group.slots) {
                const slotId = getSlotId(group.code, slot.code);
                if (!state.modalVacatedSlotIds.has(slotId)) {
                    continue;
                }
                slotsToFill.push({ group, slot, slotId });
            }
        }

        if (!slotsToFill.length) {
            setStatus('Brak miejsc do uzupełnienia.', false);
            return;
        }

        const occupiedUserIds = new Set(
            Array.from(state.modalCrewsByKey.values())
                .map((row) => row.assigned_user_id)
                .filter(Boolean)
        );

        let filledCount = 0;
        for (const { group, slot, slotId } of slotsToFill) {
            const existingRecord = getModalCrewRecord(group.code, slot.code);
            if (existingRecord?.assigned_user_id || normalizeManualName(existingRecord?.assigned_manual_name)) {
                state.modalVacatedSlotIds.delete(slotId);
                continue;
            }

            const candidate = pickModalCandidate(slot.requiredRole, occupiedUserIds);
            if (!candidate) {
                continue;
            }

            assignModalSlot(slotId, candidate.userId, '', { skipRender: true });
            occupiedUserIds.add(candidate.userId);
            filledCount += 1;
        }

        const remainingCount = state.modalVacatedSlotIds.size;
        if (filledCount > 0) {
            setStatus(`Uzupełniono składy w oknie: ${filledCount}. Pozostało wolnych miejsc: ${remainingCount}.`, remainingCount > 0);
        } else {
            setStatus('Nie znaleziono pasujących osób do uzupełnienia składów.', true);
        }

        renderModal();
    }

    function pickModalCandidate(requiredRole, occupiedUserIds) {
        return getCandidatesForRole(requiredRole).find((user) => {
            if (occupiedUserIds.has(user.userId)) {
                return false;
            }
            if (state.modalBlockedUserIds.has(user.userId)) {
                return false;
            }
            return true;
        }) || null;
    }

    async function shareOrderImage() {
        await shareCanvasImage(buildOrderExportCanvas(state.crewsByKey), `Obsady wozów - ${formatDisplayDate(state.selectedDate)}`);
    }

    async function shareModalImage() {
        await shareCanvasImage(buildOrderExportCanvas(state.modalCrewsByKey), `Obsady wozów - ${formatDisplayDate(state.selectedDate)} (okno operacyjne)`);
    }

    async function shareCanvasImage(canvas, shareText) {
        if (state.shareBusy) {
            return;
        }

        state.shareBusy = true;
        setStatus('Przygotowywanie obrazu obsad...', false);

        try {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) {
                throw new Error('Nie udało się wygenerować obrazu.');
            }

            const fileName = `obsady-wozow-${state.selectedDate}.png`;

            if (typeof File !== 'undefined' && navigator.share && navigator.canShare) {
                const file = new File([blob], fileName, { type: 'image/png' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Obsady Wozów',
                        text: shareText,
                        files: [file],
                    });
                    setStatus('Obraz obsad został udostępniony.', false);
                    return;
                }
            }

            downloadBlob(blob, fileName);
            openWhatsappText(shareText);
            setStatus('Obraz został pobrany. Otworzył się też WhatsApp z opisem.', false);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setStatus('', false);
            } else {
                console.error(error);
                setStatus('Nie udało się przygotować obrazu obsad.', true);
            }
        } finally {
            state.shareBusy = false;
        }
    }

    function buildOrderExportCanvas(sourceMap = state.crewsByKey) {
        const width = 1400;
        const padding = 48;
        const titleHeight = 48;
        const metaHeight = 34;
        const groupHeaderHeight = 42;
        const slotHeight = 34;
        const sectionTitleHeight = 28;
        const footerHeight = 32;
        const groupGap = 22;

        let contentHeight = padding + titleHeight + metaHeight + 20;
        VEHICLE_GROUPS.forEach((group) => {
            contentHeight += groupHeaderHeight;
            group.slots.forEach((slot) => {
                if (slot.section === 'SGS' && slot.code === 'sonarzysta') {
                    contentHeight += sectionTitleHeight;
                }
                contentHeight += slotHeight;
            });
            contentHeight += groupGap;
        });
        contentHeight += footerHeight + padding;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = contentHeight;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let y = padding;
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 34px Poppins, Segoe UI, sans-serif';
        ctx.fillText('OBSADY WOZÓW', padding, y);

        y += titleHeight;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 20px Poppins, Segoe UI, sans-serif';
        ctx.fillText(formatDisplayDate(state.selectedDate), padding, y);

        y += 20;

        VEHICLE_GROUPS.forEach((group) => {
            ctx.fillStyle = 'rgba(15,23,42,0.92)';
            ctx.fillRect(padding, y, width - padding * 2, groupHeaderHeight);
            ctx.fillStyle = '#38bdf8';
            ctx.font = '700 22px Poppins, Segoe UI, sans-serif';
            ctx.fillText(group.label, padding + 18, y + 28);
            y += groupHeaderHeight;

            group.slots.forEach((slot) => {
                if (slot.section === 'SGS' && slot.code === 'sonarzysta') {
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = '700 18px Poppins, Segoe UI, sans-serif';
                    ctx.fillText('SGS', padding + 18, y + 18);
                    y += sectionTitleHeight;
                }

                const record = getMapCrewRecord(sourceMap, group.code, slot.code);
                ctx.fillStyle = 'rgba(30,41,59,0.9)';
                ctx.fillRect(padding, y, width - padding * 2, slotHeight - 4);
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '600 18px Poppins, Segoe UI, sans-serif';
                ctx.fillText(`${slot.label}:`, padding + 18, y + 22);
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '500 18px Poppins, Segoe UI, sans-serif';
                ctx.fillText(getAssignedName(record) || '---', padding + 260, y + 22);
                y += slotHeight;
            });

            y += groupGap;
        });

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 16px Poppins, Segoe UI, sans-serif';
        ctx.fillText('Wygenerowano z Panelu Dowódcy', padding, canvas.height - padding + 8);
        return canvas;
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    function openWhatsappText(text) {
        const encoded = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener');
    }

    async function upsertCrewAssignment(slotInfo, userId, manualName) {
        const payload = {
            crew_date: state.selectedDate,
            shift_code: state.selectedShift,
            vehicle_code: slotInfo.group.code,
            slot_code: slotInfo.slot.code,
            slot_label: slotInfo.slot.label,
            required_role: slotInfo.slot.requiredRole,
            assigned_user_id: userId || null,
            assigned_manual_name: userId ? null : (manualName || null),
            updated_by: state.user.id,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await state.supabase
            .from('vehicle_crews')
            .upsert(payload, { onConflict: 'crew_date,shift_code,vehicle_code,slot_code' })
            .select('id, crew_date, shift_code, vehicle_code, slot_code, slot_label, required_role, assigned_user_id, assigned_manual_name, updated_by, updated_at')
            .single();

        if (error) {
            throw error;
        }

        return data;
    }

    function isUserAssignedElsewhereInModal(userId, currentSlotId) {
        if (!userId) {
            return false;
        }

        return Array.from(state.modalCrewsByKey.values()).some((row) => {
            if (row.assigned_user_id !== userId) {
                return false;
            }

            const rowSlotId = getSlotId(row.vehicle_code, row.slot_code);
            return rowSlotId !== currentSlotId;
        });
    }

    function cloneCrewMap(sourceMap) {
        return new Map(Array.from(sourceMap.entries()).map(([key, value]) => [key, value ? { ...value } : value]));
    }

    function getCrewRecord(vehicleCode, slotCode) {
        return state.crewsByKey.get(getCrewKey(vehicleCode, slotCode)) || null;
    }

    function getModalCrewRecord(vehicleCode, slotCode) {
        return state.modalCrewsByKey.get(getCrewKey(vehicleCode, slotCode)) || null;
    }

    function getMapCrewRecord(sourceMap, vehicleCode, slotCode) {
        return sourceMap.get(getCrewKey(vehicleCode, slotCode)) || null;
    }

    function getCrewKey(vehicleCode, slotCode) {
        return `${vehicleCode}:${slotCode}`;
    }

    function getSlotId(vehicleCode, slotCode) {
        return `${vehicleCode}__${slotCode}`;
    }

    function getSyntheticModalId(vehicleCode, slotCode) {
        return `modal-${vehicleCode}-${slotCode}`;
    }

    function findSlotById(slotId) {
        for (const group of VEHICLE_GROUPS) {
            for (const slot of group.slots) {
                if (getSlotId(group.code, slot.code) === slotId) {
                    return { group, slot };
                }
            }
        }
        return null;
    }

    function getAssignedName(record) {
        if (!record) {
            return '';
        }
        if (record.assigned_user_id) {
            const user = state.visibleUsers.find((item) => item.userId === record.assigned_user_id);
            return user ? getUserDisplayName(user) : record.assigned_user_id;
        }
        return record.assigned_manual_name || '';
    }

    function getUserDisplayName(user) {
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        return fullName || user.phone || 'Nieznany użytkownik';
    }

    function setStatus(message, isError = false) {
        const element = document.querySelector(selectors.status);
        if (!element) {
            return;
        }
        element.hidden = !message;
        element.textContent = message || '';
        element.style.color = isError ? 'var(--color-danger)' : '';
    }

    function resolveLoadErrorMessage(error) {
        const status = Number(error?.status || 0);
        const message = String(error?.message || '').toLowerCase();
        const details = String(error?.details || '').toLowerCase();

        if (status === 500 || message.includes('policy') || message.includes('recursion') || message.includes('infinite') || details.includes('policy')) {
            return 'Błąd uprawnień lub polityk Supabase. Uruchom SQL dla registered_users i vehicle_crews.';
        }

        return 'Nie udało się załadować danych Rozkazu.';
    }

    function formatDisplayDate(value) {
        if (!value) {
            return '--';
        }
        const [year, month, day] = value.split('-');
        return `${day}.${month}.${year}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeManualName(value) {
        return String(value || '').trim().toLocaleLowerCase('pl');
    }
})();
